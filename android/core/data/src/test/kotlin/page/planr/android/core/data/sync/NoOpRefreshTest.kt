@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.sync

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import javax.inject.Provider
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
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
import page.planr.android.core.data.local.RefreshCoalescer
import page.planr.android.core.data.prefs.AppPrefsSync
import page.planr.android.core.data.remote.AppPrefsRemote
import page.planr.android.core.data.remote.EventMutations
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.MemberMutations
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.TaskMutations
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.repository.EventRepository
import page.planr.android.core.data.repository.TaskRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.TimeWindow

/**
 * A snapshot identical to the cache is not written, and reports so
 * (`changed = false`); [SyncRunner] then re-renders only what follows the
 * clock (reminders), not the widgets.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NoOpRefreshTest {
    private lateinit var db: PlanrDatabase
    private val gate = CacheGate()
    private val gateway = FakePostgrestGateway().apply {
        seed(SupabaseTables.WORKSPACES, Fixtures.row("""{"id":"${Fixtures.WS}","name":"Home"}"""))
        seed(SupabaseTables.MEMBERS, member(name = "Anna"))
        seed(SupabaseTables.EVENTS, Fixtures.eventRow())
        seed(SupabaseTables.TASKS, Fixtures.taskRow())
    }

    /** Re-renders of the widgets proper, and of the clock-bound refresher (reminders). */
    private var widgetRenders = 0
    private var clockBoundRenders = 0

    @BeforeTest
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), PlanrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @AfterTest
    fun tearDown() = db.close()

    @Test
    fun `a window refresh reports a change only when the window differs`() = runTest {
        val repo = harness().events

        assertTrue(repo.refreshWindow(june, force = true), "empty cache: written")
        assertFalse(repo.refreshWindow(june, force = true), "same rows: not written")

        replace(SupabaseTables.EVENTS, Fixtures.eventRow(updatedAt = "2026-06-02T08:00:00.000001+00:00"))
        assertTrue(repo.refreshWindow(june, force = true), "edited elsewhere")

        replace(SupabaseTables.EVENTS)
        assertTrue(repo.refreshWindow(june, force = true), "deleted elsewhere")
        assertFalse(repo.refreshWindow(june, force = true))
    }

    @Test
    fun `an override changing is a change of its window`() = runTest {
        val repo = harness().events
        repo.refreshWindow(june, force = true)

        gateway.seed(
            SupabaseTables.EVENT_OVERRIDES,
            Fixtures.row(
                """
                {"id":"oooooooo-oooo-oooo-oooo-oooooooooooo","workspace_id":"${Fixtures.WS}",
                 "event_id":"${Fixtures.EVENT_ID}","occurrence_date":"2026-06-01T09:00:00+00:00",
                 "type":"cancel"}
                """,
            ),
        )
        assertTrue(repo.refreshWindow(june, force = true))
        assertFalse(repo.refreshWindow(june, force = true))
    }

    @Test
    fun `tasks and reference data report a change only when they differ`() = runTest {
        val h = harness()

        assertTrue(h.tasks.refresh(force = true))
        assertFalse(h.tasks.refresh(force = true))
        replace(SupabaseTables.TASKS, Fixtures.taskRow(updatedAt = "2026-06-02T08:00:00.000001+00:00"))
        assertTrue(h.tasks.refresh(force = true))

        assertTrue(h.workspace.refresh(force = true))
        assertFalse(h.workspace.refresh(force = true))
        replace(SupabaseTables.MEMBERS, member(name = "Anya"))
        assertTrue(h.workspace.refresh(force = true))
    }

    @Test
    fun `a sync that changed nothing re-plans reminders but leaves the widgets alone`() = runTest {
        val runner = harness().runner

        runner.syncAll()
        assertEquals(1 to 1, widgetRenders to clockBoundRenders, "first sync fills the cache")

        runner.syncAll()
        assertEquals(1 to 2, widgetRenders to clockBoundRenders)

        replace(SupabaseTables.TASKS, Fixtures.taskRow(updatedAt = "2026-06-02T08:00:00.000001+00:00"))
        runner.syncAll()
        assertEquals(2 to 3, widgetRenders to clockBoundRenders)
    }

    @Test
    fun `a Realtime rejoin that changed nothing requests no widget refresh`() = runTest {
        val runner = harness().runner
        runner.syncAll()
        val before = widgetRenders to clockBoundRenders

        // What RealtimeSync does on each join.
        gate.outdateSnapshots()
        runner.syncVisible()
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(before.first, widgetRenders)
        assertEquals(before.second + 1, clockBoundRenders)

        replace(SupabaseTables.EVENTS, Fixtures.eventRow(updatedAt = "2026-06-02T08:00:00.000001+00:00"))
        gate.outdateSnapshots()
        runner.syncVisible()
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(before.first + 1, widgetRenders)
    }

    @Test
    fun `a change a screen's refresh wrote redraws the widgets though the rejoin after it finds none`() = runTest {
        val h = harness()
        h.runner.syncAll()
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(1, widgetRenders, "the sync's own render covers what its refreshes requested")

        // The partner moved the event while the app was closed: the agenda
        // (a screen's refresh, not the sync's) writes the change into Room…
        replace(SupabaseTables.EVENTS, Fixtures.eventRow(updatedAt = "2026-06-02T08:00:00.000001+00:00"))
        assertTrue(h.events.refreshWindow(SyncWindows.aroundToday(clock), force = true))
        // …and the Realtime join just after it refetches the same rows.
        gate.outdateSnapshots()
        h.runner.syncVisible()
        advanceTimeBy(1_000)
        runCurrent()

        assertEquals(2, widgetRenders)
    }

    @Test
    fun `every snapshot refresh that changes the cache redraws the widgets, whoever asks`() = runTest {
        val h = harness()

        assertTrue(h.events.refreshWindow(june, force = true))
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(1, widgetRenders, "window")

        assertTrue(h.tasks.refresh(force = true))
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(2, widgetRenders, "tasks")

        assertTrue(h.workspace.refresh(force = true))
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(3, widgetRenders, "reference data")

        gateway.seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "block", taskId = Fixtures.TASK_ID))
        h.events.refreshTaskBlocks(Fixtures.TASK_ID)
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(4, widgetRenders, "task blocks")

        // Nothing differs: no redraw.
        h.events.refreshWindow(june, force = true)
        h.tasks.refresh(force = true)
        h.workspace.refresh(force = true)
        h.events.refreshTaskBlocks(Fixtures.TASK_ID)
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(4, widgetRenders)
    }

    @Test
    fun `nothing to sync still re-plans reminders`() = runTest {
        harness().runner.catchUpClock()
        assertEquals(0 to 1, widgetRenders to clockBoundRenders)
    }

    // --- fixtures ---

    private val june = TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z"))

    /** Inside [june], so the synced window around "today" covers the fixtures. */
    private val clock = object : Clock {
        override fun now() = Instant.parse("2026-06-03T12:00:00Z")
    }

    private fun replace(table: String, vararg rows: JsonObject) {
        gateway.tables[table] = rows.toMutableList()
    }

    private class Harness(
        val events: EventRepository,
        val tasks: TaskRepository,
        val workspace: WorkspaceRepository,
        val runner: SyncRunner,
    )

    private fun TestScope.harness(): Harness {
        val session = session()
        val widgets = WidgetRefreshDispatcher(
            Provider {
                setOf(
                    object : WidgetRefresher {
                        override suspend fun refreshWidgets() { widgetRenders++ }
                    },
                    object : WidgetRefresher {
                        override suspend fun refreshWidgets() { clockBoundRenders++ }
                        override val followsClock = true
                    },
                )
            },
            backgroundScope,
        )
        val queries = WorkspaceQueries(gateway)
        val events = EventRepository(session, queries, EventMutations(gateway), db, gate, widgets)
        val tasks = TaskRepository(session, queries, TaskMutations(gateway), db, gate, widgets, clock)
        val workspace = WorkspaceRepository(session, queries, MemberMutations(gateway), db.workspaceDao(), gate, widgets)
        val prefs = AppPrefsSync(
            MemoryDataStore(), MemoryDataStore(), AppPrefsRemote(gateway), session, widgets, backgroundScope,
            RefreshCoalescer(gate, clock),
        )
        val runner = SyncRunner(session, workspace, events, tasks, VisibleWindowTracker(), widgets, prefs, clock)
        runCurrent() // the widget dispatcher starts listening
        return Harness(events, tasks, workspace, runner)
    }

    private class MemoryDataStore : DataStore<Preferences> {
        private val state = MutableStateFlow(emptyPreferences())
        private val mutex = Mutex()
        override val data: Flow<Preferences> = state

        override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
            mutex.withLock { transform(state.value).also { state.value = it } }
    }

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

    private companion object {
        fun member(name: String) = Fixtures.row(
            """
            {"id":"${Fixtures.MEMBER_A}","workspace_id":"${Fixtures.WS}","name":"$name","color":"#c0492a",
             "timezone":"Europe/Berlin","secondary_timezone":null,"show_success_toasts":true}
            """,
        )
    }
}
