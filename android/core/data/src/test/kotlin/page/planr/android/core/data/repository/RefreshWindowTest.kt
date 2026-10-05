@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.repository

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import java.io.IOException
import javax.inject.Provider
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.time.Clock
import kotlin.time.Instant
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
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.RowFilter
import page.planr.android.core.data.remote.RowOrder
import page.planr.android.core.data.remote.SelectPage
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.remote.decodeAs
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow

/**
 * `EventRepository.refreshWindow` over the bounded, paginated `fetchWindow`:
 * it deletes exactly the cached rows the server no longer returns for the
 * window, and nothing when a page fails. Room/session setup copied from
 * RepositoryTest.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RefreshWindowTest {
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

    private fun TestScope.events(source: PostgrestGateway = gateway): EventRepository {
        val widgets = WidgetRefreshDispatcher(
            Provider { setOf(object : WidgetRefresher { override suspend fun refreshWidgets() = Unit }) },
            backgroundScope,
        )
        return EventRepository(session(), WorkspaceQueries(source), EventMutations(source), db, gate, widgets)
    }

    private val june = TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z"))

    private suspend fun cache(vararg rows: JsonObject) =
        db.eventDao().upsertEvents(rows.map { it.decodeAs(PlannerEvent.serializer()).toEntity() })

    private suspend fun cachedWindowIds(): Set<String> = db.eventDao().observeWindow(
        Fixtures.WS,
        june.start.toEpochMilliseconds(),
        june.end.toEpochMilliseconds(),
    ).first().map { it.id }.toSet()

    @Test
    fun `rows outside the window survive although the server doesn't return them`() = runTest {
        cache(
            // Ended before the window: the bounded query no longer sends it.
            Fixtures.eventRow(id = "old", start = "2026-05-01T09:00:00+00:00", end = "2026-05-01T10:00:00+00:00"),
            // A series that ended before the window: likewise outside IN_WINDOW.
            Fixtures.eventRow(
                id = "ended",
                start = "2026-01-05T09:00:00+00:00",
                end = "2026-01-05T10:00:00+00:00",
                rrule = "FREQ=DAILY;COUNT=3",
                recurrenceEndsAt = "2026-01-07T09:00:00+00:00",
            ),
        )
        gateway.seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "inside"))

        events().refreshWindow(june)

        assertNotNull(db.eventDao().getById("old"))
        assertNotNull(db.eventDao().getById("ended"))
        assertEquals(setOf("inside"), cachedWindowIds())
    }

    @Test
    fun `a row deleted on the server is removed from the window`() = runTest {
        cache(
            Fixtures.eventRow(id = "deleted"),
            Fixtures.eventRow(id = "series", start = "2026-01-05T09:00:00+00:00", end = "2026-01-05T10:00:00+00:00", rrule = "FREQ=WEEKLY"),
        )
        gateway.seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "kept"))

        events().refreshWindow(june)

        assertNull(db.eventDao().getById("deleted"))
        assertNull(db.eventDao().getById("series"))
        assertEquals(setOf("kept"), cachedWindowIds())
    }

    @Test
    fun `a window past max_rows is stored whole`() = runTest {
        gateway.seed(SupabaseTables.EVENTS, *Array(1_203) { Fixtures.eventRow(id = "ev-%05d".format(it)) })

        events().refreshWindow(june)

        assertEquals(1_203, cachedWindowIds().size)
    }

    @Test
    fun `a failed page leaves the cache untouched`() = runTest {
        cache(Fixtures.eventRow(id = "cached"))
        gateway.seed(SupabaseTables.EVENTS, *Array(1_203) { Fixtures.eventRow(id = "ev-%05d".format(it)) })
        var pages = 0
        val failing = object : PostgrestGateway by gateway {
            override suspend fun selectPage(
                table: String,
                columns: String,
                filters: List<RowFilter>,
                order: List<RowOrder>,
                limit: Long,
            ): SelectPage {
                if (++pages == 2) throw IOException("connection reset")
                return gateway.selectPage(table, columns, filters, order, limit)
            }
        }

        assertFailsWith<IOException> { events(failing).refreshWindow(june) }

        assertEquals(setOf("cached"), cachedWindowIds())
    }
}
