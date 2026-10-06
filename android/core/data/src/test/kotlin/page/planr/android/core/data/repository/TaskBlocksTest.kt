@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.repository

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import javax.inject.Provider
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.time.Clock
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
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
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.remote.EventMutations
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.remote.decodeAs
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.core.model.PlannerEvent

/**
 * `EventRepository.refreshTaskBlocks` / `observeTaskBlocks`: a task's blocks
 * are replaced exactly (by `task_id`, whatever their dates), and nothing else
 * in the cache is touched. Room/session setup copied from RefreshWindowTest.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TaskBlocksTest {
    private lateinit var db: PlanrDatabase
    private val gateway = FakePostgrestGateway()
    private val gate = CacheGate()

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

    private fun TestScope.events(): EventRepository {
        val widgets = WidgetRefreshDispatcher(
            Provider { setOf(object : WidgetRefresher { override suspend fun refreshWidgets() = Unit }) },
            backgroundScope,
        )
        return EventRepository(session(), WorkspaceQueries(gateway), EventMutations(gateway), db, gate, widgets)
    }

    private suspend fun cache(vararg rows: JsonObject) =
        db.eventDao().upsertEvents(rows.map { it.decodeAs(PlannerEvent.serializer()).toEntity() })

    @Test
    fun `refresh replaces the task's blocks, whatever their dates`() = runTest {
        cache(
            // Deleted on the server since it was cached.
            Fixtures.eventRow(id = "gone", taskId = TASK),
            // Another task's block and a plain event stay as they are.
            Fixtures.eventRow(id = "other-task", taskId = "task-2"),
            Fixtures.eventRow(id = "plain"),
        )
        gateway.seed(
            SupabaseTables.EVENTS,
            // Far outside any synced window.
            Fixtures.eventRow(id = "late", start = "2027-03-01T15:00:00+00:00", end = "2027-03-01T16:00:00+00:00", taskId = TASK),
            Fixtures.eventRow(id = "early", start = "2025-01-01T09:00:00+00:00", end = "2025-01-01T09:30:00+00:00", taskId = TASK),
            Fixtures.eventRow(id = "other-task", taskId = "task-2"),
        )
        val repo = events()

        repo.refreshTaskBlocks(TASK)

        assertEquals(listOf("early", "late"), repo.observeTaskBlocks(TASK).first().map { it.id })
        assertNotNull(db.eventDao().getById("other-task"))
        assertNotNull(db.eventDao().getById("plain"))
        assertEquals(null, db.eventDao().getById("gone"))
    }

    @Test
    fun `a block created here shows up without a refresh`() = runTest {
        val repo = events()
        val draft = Fixtures.eventRow(id = "x", taskId = TASK).decodeAs(PlannerEvent.serializer()).toDraft()

        val created = repo.createEvent(draft)

        assertEquals(listOf(created.id), repo.observeTaskBlocks(TASK).first().map { it.id })
    }

    private companion object {
        const val TASK = Fixtures.TASK_ID
    }
}
