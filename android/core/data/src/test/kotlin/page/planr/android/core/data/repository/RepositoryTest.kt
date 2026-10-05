@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.repository

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import javax.inject.Provider
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import page.planr.android.core.data.auth.OAuthTokenClient
import page.planr.android.core.data.auth.OAuthTokens
import page.planr.android.core.data.auth.PendingAuthorization
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SessionStore
import page.planr.android.core.data.auth.StoredSession
import page.planr.android.core.data.auth.TestTokens
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.local.PlanrDatabase
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.remote.EventMutations
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.RowFilter
import page.planr.android.core.data.remote.RowOrder
import page.planr.android.core.data.remote.SelectPage
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.TaskMutations
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.remote.decodeAs
import page.planr.android.core.data.sync.RealtimeChangeApplier
import page.planr.android.core.data.sync.RowChange
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.core.model.Board
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TaskNotToggleableException
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.PatchField

/** Repositories over a fake PostgREST and a real (in-memory) Room. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RepositoryTest {
    private lateinit var db: PlanrDatabase
    private val gateway = FakePostgrestGateway()
    private val gate = CacheGate()
    private var widgetRefreshes = 0

    @BeforeTest
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), PlanrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @AfterTest
    fun tearDown() = db.close()

    private fun TestScope.session(): SessionManager {
        val store = object : SessionStore {
            override suspend fun readSession() = StoredSession(
                accessToken = TestTokens.jwt(exp = 4_000_000_000),
                refreshToken = "r",
                expiresAtEpochSec = 4_000_000_000,
                userId = "user-1",
                memberId = Fixtures.MEMBER_A,
                workspaceId = Fixtures.WS,
            )
            override suspend fun writeSession(session: StoredSession?) = Unit
            override suspend fun readPending(): PendingAuthorization? = null
            override suspend fun writePending(pending: PendingAuthorization?) = Unit
        }
        val noTokens = object : OAuthTokenClient {
            override suspend fun exchangeCode(code: String, codeVerifier: String, redirectUri: String) = error("unused")
            override suspend fun refresh(refreshToken: String): OAuthTokens = error("unused")
            override suspend fun revokeSession(accessToken: String) = Unit
        }
        return SessionManager(TestTokens.config, store, noTokens, { null }, { }, Clock.System, backgroundScope)
            .also { runCurrent() }
    }

    private fun TestScope.widgets() = WidgetRefreshDispatcher(
        Provider { setOf(object : WidgetRefresher { override suspend fun refreshWidgets() { widgetRefreshes++ } }) },
        backgroundScope,
    )

    private fun TestScope.events(queries: WorkspaceQueries = WorkspaceQueries(gateway)) =
        EventRepository(session(), queries, EventMutations(gateway), db, gate, widgets())

    private fun TestScope.tasks(clock: Clock = Clock.System) =
        TaskRepository(session(), WorkspaceQueries(gateway), TaskMutations(gateway), db, gate, widgets(), clock)

    private val june = TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z"))

    private suspend fun cachedEventIds(): List<String> = db.eventDao().observeWindow(
        Fixtures.WS,
        june.start.toEpochMilliseconds(),
        june.end.toEpochMilliseconds(),
    ).first().map { it.id }.sorted()

    @Test
    fun `refreshWindow replaces the window, dropping rows deleted elsewhere`() = runTest {
        // Cached locally, but no longer on the server.
        db.eventDao().upsertEvents(listOf(Fixtures.eventRow(id = "gone").decodeAs(PlannerEvent.serializer()).toEntity()))
        gateway.seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "kept"))

        events().refreshWindow(
            TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z")),
        )

        val ids = db.eventDao().observeWindow(
            Fixtures.WS,
            Instant.parse("2026-06-01T00:00:00Z").toEpochMilliseconds(),
            Instant.parse("2026-06-08T00:00:00Z").toEpochMilliseconds(),
        ).first().map { it.id }
        assertEquals(listOf("kept"), ids)
    }

    @Test
    fun `a stale update reloads the latest row before rethrowing`() = runTest {
        gateway.seed(SupabaseTables.EVENTS, Fixtures.eventRow())
        val repo = events()
        val original = WorkspaceQueries(gateway).fetchEvent(Fixtures.WS, Fixtures.EVENT_ID)!!
        db.eventDao().upsertEvents(listOf(original.toEntity()))

        // The partner edits meanwhile.
        EventMutations(gateway).updateEvent(Fixtures.EVENT_ID, EventPatch(title = PatchField.Value("Partner's")))

        assertFailsWith<StaleWriteException> {
            repo.updateEvent(Fixtures.EVENT_ID, EventPatch(title = PatchField.Value("Mine")), original.updatedAt)
        }
        assertEquals("Partner's", repo.getEvent(Fixtures.EVENT_ID)?.title)
    }

    @Test
    fun `completing a task moves it to the first done board`() = runTest {
        gateway.seed(SupabaseTables.TASKS, Fixtures.taskRow())
        val collection = "cccccccc-cccc-cccc-cccc-cccccccccccc"
        db.workspaceDao().upsertBoards(
            listOf(board("todo", collection, 0.0, false), board("done", collection, 2.0, true), board("archive", collection, 3.0, true))
                .map { it.toEntity() },
        )
        val clock = object : Clock { override fun now() = Instant.parse("2026-06-01T12:00:00Z") }
        val repo = tasks(clock)
        val task = WorkspaceQueries(gateway).fetchTasks(Fixtures.WS).single()

        val done = repo.setDone(task, done = true)

        assertEquals("done", done.boardId)
        assertNotNull(done.completedAt)
        val patch = gateway.callsOf<FakePostgrestGateway.Call.Update>().single().patch
        assertEquals(
            mapOf("completed_at" to JsonPrimitive("2026-06-01T12:00:00.000Z"), "board_id" to JsonPrimitive("done")),
            patch.toMap(),
        )
        assertEquals("done", repo.observeTask(task.id).first()?.boardId)
    }

    @Test
    fun `a task without a done column can't be completed`() = runTest {
        gateway.seed(SupabaseTables.TASKS, Fixtures.taskRow())
        val task = WorkspaceQueries(gateway).fetchTasks(Fixtures.WS).single()

        assertFailsWith<TaskNotToggleableException> { tasks().setDone(task, done = true) }
        // Nothing was written: the DB trigger would have cleared completed_at anyway.
        assertEquals(emptyList(), gateway.callsOf<FakePostgrestGateway.Call.Update>())
    }

    /** [gateway], running [afterEventSelect] right after each `events` page returns. */
    private fun hooked(afterEventSelect: suspend (call: Int) -> Unit) = object : PostgrestGateway by gateway {
        var eventSelects = 0
        override suspend fun selectPage(
            table: String,
            columns: String,
            filters: List<RowFilter>,
            order: List<RowOrder>,
            limit: Long,
        ): SelectPage = gateway.selectPage(table, columns, filters, order, limit).also {
            if (table == SupabaseTables.EVENTS) afterEventSelect(eventSelects++)
        }
    }

    @Test
    fun `a task refresh past max_rows keeps every task`() = runTest {
        gateway.seed(SupabaseTables.TASKS, *Array(1_203) { Fixtures.taskRow(id = "task-%05d".format(it)) })

        tasks().refresh()

        assertEquals(1_203, db.taskDao().observeAll(Fixtures.WS).first().size)
    }

    @Test
    fun `a window refresh doesn't delete a row that arrived while it was fetching`() = runTest {
        val ticket = gate.ticket()
        // The first fetch sees an empty window; a Realtime INSERT lands before it is applied.
        val racing = hooked { call ->
            if (call == 0) {
                gateway.seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "new"))
                RealtimeChangeApplier(db, gate)
                    .apply(SupabaseTables.EVENTS, RowChange.Upsert(Fixtures.eventRow(id = "new")), ticket)
            }
        }

        events(WorkspaceQueries(racing)).refreshWindow(june)

        assertEquals(2, racing.eventSelects) // refetched instead of applying the stale snapshot
        assertEquals(listOf("new"), cachedEventIds())
    }

    @Test
    fun `nothing is written back after the cache was wiped mid-request`() = runTest {
        gateway.seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "private"))
        val signingOut = hooked { gate.wipe { db.clearAllTables() } }

        events(WorkspaceQueries(signingOut)).refreshWindow(june)

        assertEquals(emptyList(), cachedEventIds())
    }

    private fun board(id: String, collection: String, position: Double, isDone: Boolean) = JsonObject(
        mapOf(
            "id" to JsonPrimitive(id),
            "workspace_id" to JsonPrimitive(Fixtures.WS),
            "collection_id" to JsonPrimitive(collection),
            "name" to JsonPrimitive(id),
            "position" to JsonPrimitive(position),
            "is_done" to JsonPrimitive(isDone),
            "created_at" to JsonPrimitive("2026-05-01T10:00:00+00:00"),
            "updated_at" to JsonPrimitive("2026-05-01T10:00:00+00:00"),
        ),
    ).decodeAs(Board.serializer())
}
