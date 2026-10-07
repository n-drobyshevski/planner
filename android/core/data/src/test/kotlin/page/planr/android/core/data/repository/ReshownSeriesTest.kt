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
import page.planr.android.core.data.remote.EventMutations
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.sync.RealtimeChangeApplier
import page.planr.android.core.data.sync.RowChange
import page.planr.android.core.data.sync.RowGone
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher

/**
 * A shared series turned private and then shared again: the hide took its
 * overrides out of the cache, and the re-share's UPDATE carries only the
 * series row, so the applier reports them unknown and
 * `EventRepository.refreshOverridesOf` brings them back.
 * Room/session setup copied from TaskBlocksTest.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ReshownSeriesTest {
    private lateinit var db: PlanrDatabase
    private val gateway = FakePostgrestGateway()
    private val gate = CacheGate()
    private lateinit var applier: RealtimeChangeApplier

    @BeforeTest
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), PlanrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        applier = RealtimeChangeApplier(db, gate)
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

    private val series = Fixtures.eventRow(rrule = "FREQ=DAILY")
    private val reshared = JsonObject(series + ("updated_at" to JsonPrimitive("2026-05-21T08:00:00.000001+00:00")))
    private val hidden = RowGone(SupabaseTables.EVENTS, Fixtures.EVENT_ID, RowGone.Kind.Hidden, ownerId = PARTNER, actor = PARTNER)

    private suspend fun overrideIds() = db.eventDao().observeOverridesFor(Fixtures.EVENT_ID).first().map { it.id }

    @Test
    fun `a series shared again gets its overrides back`() = runTest {
        val events = events()
        applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(series, inserted = true))
        applier.apply(SupabaseTables.EVENT_OVERRIDES, RowChange.Upsert(overrideRow("o1", day = 1), inserted = true))
        applier.apply(SupabaseTables.EVENT_OVERRIDES, RowChange.Upsert(overrideRow("o2", day = 2), inserted = true))

        applier.apply(hidden.table, hidden.toDelete())
        assertEquals(emptyList(), overrideIds(), "a private series keeps nothing of itself on the partner's device")

        val applied = applier.applyChange(SupabaseTables.EVENTS, RowChange.Upsert(reshared))
        assertEquals(RealtimeChangeApplier.Applied(changed = true, overridesUnknownOf = Fixtures.EVENT_ID), applied)

        gateway.seed(SupabaseTables.EVENT_OVERRIDES, overrideRow("o1", day = 1), overrideRow("o2", day = 2), overrideRow("x", day = 1, eventId = "other"))
        events.refreshOverridesOf(Fixtures.EVENT_ID)

        assertEquals(listOf("o1", "o2"), overrideIds())
    }

    @Test
    fun `only a series that was not cached and came by an update has unknown overrides`() = runTest {
        // New: its overrides (if any) arrive as inserts of their own.
        assertNull(applier.applyChange(SupabaseTables.EVENTS, RowChange.Upsert(series, inserted = true)).overridesUnknownOf)
        // Cached: its overrides are cached too.
        assertNull(applier.applyChange(SupabaseTables.EVENTS, RowChange.Upsert(reshared)).overridesUnknownOf)
        // A one-off has none.
        val oneOff = Fixtures.eventRow(id = "one-off")
        assertNull(applier.applyChange(SupabaseTables.EVENTS, RowChange.Upsert(oneOff)).overridesUnknownOf)
    }

    @Test
    fun `overrides are not stored for a series that left the cache meanwhile`() = runTest {
        val events = events()
        gateway.seed(SupabaseTables.EVENT_OVERRIDES, overrideRow("o1", day = 1))

        events.refreshOverridesOf(Fixtures.EVENT_ID)

        assertEquals(emptyList(), overrideIds())
    }

    private fun overrideRow(id: String, day: Int, eventId: String = Fixtures.EVENT_ID) = Fixtures.row(
        """
        {
          "id": "$id",
          "workspace_id": "${Fixtures.WS}",
          "event_id": "$eventId",
          "occurrence_date": "2026-06-0${1 + day}T09:00:00+00:00",
          "type": "cancel"
        }
        """,
    )

    private companion object {
        const val PARTNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    }
}
