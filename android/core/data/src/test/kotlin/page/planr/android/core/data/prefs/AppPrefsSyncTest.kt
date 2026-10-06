@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import java.io.IOException
import javax.inject.Provider
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.auth.OAuthTokenClient
import page.planr.android.core.data.auth.OAuthTokens
import page.planr.android.core.data.auth.PendingAuthorization
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SessionStore
import page.planr.android.core.data.auth.StoredSession
import page.planr.android.core.data.auth.TestTokens
import page.planr.android.core.data.remote.AppPrefsRemote
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher

/** [AppPrefsSync] over a fake PostgREST and in-memory Preferences stores. */
class AppPrefsSyncTest {
    private val fake = FakePostgrestGateway()
    private var offline = false
    private var widgetRefreshes = 0

    /** [fake], failing every upsert while [offline]. */
    private val gateway = object : PostgrestGateway by fake {
        override suspend fun upsert(table: String, rows: List<JsonObject>, onConflict: String): List<JsonObject> {
            if (offline) throw IOException("offline")
            return fake.upsert(table, rows, onConflict)
        }
    }

    private val me = Fixtures.MEMBER_A
    private val partner = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    private class Harness(
        val sync: AppPrefsSync,
        val view: DataStoreViewPreferences,
        val insights: DataStoreInsightsPreferences,
        val viewStore: DataStore<Preferences>,
    )

    private fun TestScope.harness(): Harness {
        val viewStore = MemoryDataStore()
        val insightsStore = MemoryDataStore()
        val widgets = WidgetRefreshDispatcher(
            Provider { setOf(object : WidgetRefresher { override suspend fun refreshWidgets() { widgetRefreshes++ } }) },
            backgroundScope,
        )
        val sync = AppPrefsSync(viewStore, insightsStore, AppPrefsRemote(gateway), session(), widgets, backgroundScope)
        return Harness(
            sync = sync,
            view = DataStoreViewPreferences(viewStore, widgets, sync),
            insights = DataStoreInsightsPreferences(insightsStore, sync),
            viewStore = viewStore,
        ).also { runCurrent() } // the widget dispatcher starts listening
    }

    /**
     * In memory, so every write happens on the test scheduler (a file-backed
     * store hops to real IO threads, which `advanceUntilIdle` can't wait for).
     */
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
                memberId = me,
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

    private fun row(
        member: String = me,
        showPartner: Boolean = false,
        mode: String = "week",
        hidden: List<String> = listOf("cat-work"),
        includeInactive: Boolean = true,
    ) = JsonObject(
        mapOf(
            "member_id" to JsonPrimitive(member),
            "workspace_id" to JsonPrimitive(Fixtures.WS),
            "show_partner_events" to JsonPrimitive(showPartner),
            "agenda_mode" to JsonPrimitive(mode),
            "insights_hidden_category_ids" to JsonArray(hidden.map(::JsonPrimitive)),
            "insights_include_inactive" to JsonPrimitive(includeInactive),
            "updated_at" to JsonPrimitive("2026-10-05 10:00:00.123456+00"),
        ),
    )

    /**
     * Runs the background uploads, then the debounced widget refresh
     * (advanceUntilIdle would skip both: they live in backgroundScope).
     */
    private fun TestScope.settle() {
        runCurrent()
        advanceTimeBy(10.seconds)
        runCurrent()
    }

    private suspend fun Harness.pending(): Long? = viewStore.data.first()[ViewKeys.SYNC_PENDING]

    private fun storedRow(): JsonObject? = fake.rows(SupabaseTables.MEMBER_APP_PREFS).singleOrNull()

    @Test
    fun `a pull restores the account copy onto a fresh install`() = runTest {
        fake.seed(SupabaseTables.MEMBER_APP_PREFS, row())
        val h = harness()

        h.sync.pull()
        settle()

        assertEquals(false, h.view.showPartnerEvents.first())
        assertEquals(AgendaViewMode.Week, h.view.agendaMode.first())
        assertEquals(InsightsFilterPrefs(setOf("cat-work"), includeInactive = true), h.insights.filters(me).first())
        // Another viewer's keys aren't touched.
        assertEquals(InsightsFilterPrefs(), h.insights.filters(partner).first())
        // The widgets re-render without the partner.
        assertEquals(1, widgetRefreshes)
        assertEquals(emptyList(), fake.callsOf<FakePostgrestGateway.Call.Upsert>())
    }

    @Test
    fun `no account copy yet uploads the device's settings`() = runTest {
        val h = harness()
        // Saved before syncing existed: written straight to the file.
        h.viewStore.updateData { it.toMutablePreferences().apply { set(ViewKeys.SHOW_PARTNER_EVENTS, false) } }

        h.sync.pull()

        val upsert = fake.callsOf<FakePostgrestGateway.Call.Upsert>().single()
        assertEquals("member_id", upsert.onConflict)
        assertEquals(
            JsonObject(
                mapOf(
                    "member_id" to JsonPrimitive(me),
                    "workspace_id" to JsonPrimitive(Fixtures.WS),
                    "show_partner_events" to JsonPrimitive(false),
                    "agenda_mode" to JsonPrimitive("day"),
                    "insights_hidden_category_ids" to JsonArray(emptyList()),
                    "insights_include_inactive" to JsonPrimitive(false),
                ),
            ),
            upsert.rows.single(),
        )
        assertEquals(false, h.view.showPartnerEvents.first())
    }

    @Test
    fun `a local change is saved at once and uploaded`() = runTest {
        val h = harness()

        h.view.setAgendaMode(AgendaViewMode.Week)
        h.insights.setHiddenCategories(me, setOf("cat-b", "cat-a"))
        assertEquals(AgendaViewMode.Week, h.view.agendaMode.first())
        settle()

        val stored = storedRow()!!
        assertEquals(JsonPrimitive("week"), stored["agenda_mode"])
        assertEquals(JsonArray(listOf(JsonPrimitive("cat-a"), JsonPrimitive("cat-b"))), stored["insights_hidden_category_ids"])
        assertNull(h.pending())
    }

    @Test
    fun `a failed upload stays pending and wins over the account on the next pull`() = runTest {
        fake.seed(SupabaseTables.MEMBER_APP_PREFS, row(showPartner = true, mode = "day"))
        val h = harness()
        offline = true

        h.view.setShowPartnerEvents(false)
        settle()
        assertEquals(1L, h.pending())
        assertEquals(JsonPrimitive(true), storedRow()!!["show_partner_events"])

        // Still offline: the account copy must not overwrite the pending change.
        runCatching { h.sync.pull() }
        assertEquals(false, h.view.showPartnerEvents.first())

        offline = false
        h.sync.pull()
        assertNull(h.pending())
        assertEquals(JsonPrimitive(false), storedRow()!!["show_partner_events"])
    }

    @Test
    fun `realtime applies this member's row unless a change is pending`() = runTest {
        val h = harness()

        h.sync.applyRemote(row(member = partner, mode = "week"))
        assertEquals(AgendaViewMode.Day, h.view.agendaMode.first())

        h.sync.applyRemote(row(mode = "week"))
        assertEquals(AgendaViewMode.Week, h.view.agendaMode.first())

        offline = true
        h.view.setAgendaMode(AgendaViewMode.Day)
        settle()
        h.sync.applyRemote(row(mode = "week"))
        assertEquals(AgendaViewMode.Day, h.view.agendaMode.first())
    }

    @Test
    fun `month stays on this device, over the synced day or week`() = runTest {
        fake.seed(SupabaseTables.MEMBER_APP_PREFS, row(mode = "week"))
        val h = harness()
        h.sync.pull()

        h.view.setAgendaMode(AgendaViewMode.Month)
        settle()
        assertEquals(AgendaViewMode.Month, h.view.agendaMode.first())
        // The column only admits day / week: nothing is uploaded or left pending.
        assertEquals(emptyList(), fake.callsOf<FakePostgrestGateway.Call.Upsert>())
        assertNull(h.pending())

        // Another setting changes elsewhere: the row's period is the same, Month stays.
        h.sync.applyRemote(row(mode = "week", showPartner = true))
        assertEquals(AgendaViewMode.Month, h.view.agendaMode.first())
        h.sync.pull()
        assertEquals(AgendaViewMode.Month, h.view.agendaMode.first())

        // An upload of another change carries the synced week, never "month".
        h.view.setShowPartnerEvents(false)
        settle()
        assertEquals(JsonPrimitive("week"), storedRow()!!["agenda_mode"])

        // Another device picks Day: this one follows.
        h.sync.applyRemote(row(mode = "day"))
        assertEquals(AgendaViewMode.Day, h.view.agendaMode.first())
    }

    @Test
    fun `month on a fresh device survives a pull of the default day`() = runTest {
        fake.seed(SupabaseTables.MEMBER_APP_PREFS, row(mode = "day"))
        val h = harness()
        h.view.setAgendaMode(AgendaViewMode.Month)

        h.sync.pull()

        assertEquals(AgendaViewMode.Month, h.view.agendaMode.first())
        // Picking Week again leaves Month and syncs as before.
        h.view.setAgendaMode(AgendaViewMode.Week)
        settle()
        assertEquals(AgendaViewMode.Week, h.view.agendaMode.first())
        assertEquals(JsonPrimitive("week"), storedRow()!!["agenda_mode"])
    }

    @Test
    fun `an account copy saying month, as the web names it, opens month here`() = runTest {
        val h = harness()
        h.view.setAgendaMode(AgendaViewMode.Week)
        settle()

        h.sync.applyRemote(row(mode = "month"))

        assertEquals(AgendaViewMode.Month, h.view.agendaMode.first())
        assertEquals("month", AgendaViewMode.Month.wire)
        assertEquals(AgendaViewMode.Month, AgendaViewMode.fromWire("month"))
    }

    @Test
    fun `sign-out clears the device copy`() = runTest {
        val h = harness()
        h.view.setShowPartnerEvents(false)
        h.insights.setIncludeInactive(me, true)
        settle()

        h.sync.clearLocal()

        assertEquals(true, h.view.showPartnerEvents.first())
        assertEquals(InsightsFilterPrefs(), h.insights.filters(me).first())
        assertNull(h.pending())
    }
}
