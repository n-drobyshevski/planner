@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.repository

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import javax.inject.Provider
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.TimeZone
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
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.remote.decodeAs
import page.planr.android.core.data.sync.VisibleWindowTracker
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.DefaultRecurrenceExpander

/**
 * [OccurrenceRepository.observeUntracked]: the same occurrences as
 * [OccurrenceRepository.observeOccurrences], without marking the window as the
 * one on screen. Room/session setup copied from RepositoryTest.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class OccurrenceRepositoryUntrackedTest {
    private lateinit var db: PlanrDatabase
    private val gateway = FakePostgrestGateway()
    private val tracker = VisibleWindowTracker()

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

    private fun TestScope.occurrences(): OccurrenceRepository {
        val session = session()
        val widgets = WidgetRefreshDispatcher(
            Provider { setOf(object : WidgetRefresher { override suspend fun refreshWidgets() = Unit }) },
            backgroundScope,
        )
        val events = EventRepository(session, WorkspaceQueries(gateway), EventMutations(gateway), db, CacheGate(), widgets)
        return OccurrenceRepository(session, db, DefaultRecurrenceExpander, tracker, events)
    }

    private val june = TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z"))

    @Test
    fun `observeUntracked emits what observeOccurrences does and leaves the visible window alone`() = runTest {
        db.eventDao().upsertEvents(
            listOf(
                Fixtures.eventRow(id = "single").decodeAs(PlannerEvent.serializer()).toEntity(),
                Fixtures.eventRow(id = "daily", rrule = "FREQ=DAILY;COUNT=3").decodeAs(PlannerEvent.serializer()).toEntity(),
            ),
        )
        val repo = occurrences()

        val untracked = repo.observeUntracked(june, TimeZone.UTC).first { it.isNotEmpty() }
        assertNull(tracker.window.value)

        val tracked = repo.observeOccurrences(june, TimeZone.UTC).first { it.isNotEmpty() }
        assertEquals(tracked, untracked)
        assertEquals(4, untracked.size)
        // Only the tracked read marks the window on screen.
        assertEquals(june, tracker.window.value)
    }
}
