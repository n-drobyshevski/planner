@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.auth.OAuthTokenClient
import page.planr.android.core.data.auth.OAuthTokens
import page.planr.android.core.data.auth.PendingAuthorization
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SessionStore
import page.planr.android.core.data.auth.StoredSession
import page.planr.android.core.data.auth.TestTokens
import page.planr.android.core.data.model.SleepRating
import page.planr.android.core.data.model.SleepTimes
import page.planr.android.core.data.model.SleepTimesSource
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.RowOrder
import page.planr.android.core.data.remote.RowFilter
import page.planr.android.core.data.remote.SleepRemote
import page.planr.android.core.data.remote.SupabaseTables

/** [RemoteSleepLogRepository] over a fake PostgREST: the check-in's payload and the device times it leaves alone. */
class SleepLogRepositoryTest {
    private val fake = FakePostgrestGateway()
    private val oct5 = LocalDate(2026, 10, 5)

    /** 6 October 2026, 09:00 UTC. */
    private val clock = object : Clock {
        override fun now(): Instant = Instant.parse("2026-10-06T09:00:00Z")
    }

    private class MemoryDataStore : DataStore<Preferences> {
        private val state = MutableStateFlow(emptyPreferences())
        private val mutex = Mutex()
        override val data: Flow<Preferences> = state
        override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
            mutex.withLock { transform(state.value).also { state.value = it } }
    }

    private val store = MemoryDataStore()

    private fun TestScope.repository(
        member: String = Fixtures.MEMBER_A,
        gateway: PostgrestGateway = fake,
    ): RemoteSleepLogRepository = RemoteSleepLogRepository(SleepRemote(gateway), session(member), store, clock)

    /** [fake], but a range read (the refresh) answers only once [release] completes, with what was stored when it was sent. */
    private class SlowReads(private val inner: FakePostgrestGateway) : PostgrestGateway by inner {
        var release: CompletableDeferred<Unit>? = null

        override suspend fun select(
            table: String,
            columns: String,
            filters: List<RowFilter>,
            order: List<RowOrder>,
            limit: Long?,
        ): List<JsonObject> {
            val rows = inner.select(table, columns, filters, order, limit)
            if (filters.any { it is RowFilter.Gte }) release?.await()
            return rows
        }
    }

    private fun TestScope.session(member: String): SessionManager {
        val stored = object : SessionStore {
            override suspend fun readSession() = StoredSession(
                accessToken = TestTokens.jwt(exp = 4_000_000_000),
                refreshToken = "r",
                expiresAtEpochSec = 4_000_000_000,
                userId = "user-1",
                memberId = member,
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
        return SessionManager(TestTokens.config, stored, noTokens, { null }, { }, Clock.System, backgroundScope)
            .also { runCurrent() }
    }

    /** A Health Connect night on 5 October: 23:31:20 → 07:02:40 UTC, stages, no ratings. */
    private fun seedDeviceNight(member: String = Fixtures.MEMBER_A, date: String = "2026-10-05") {
        fake.seed(
            SupabaseTables.SLEEP_LOGS,
            JsonObject(
                mapOf(
                    "workspace_id" to JsonPrimitive(Fixtures.WS),
                    "member_id" to JsonPrimitive(member),
                    "date" to JsonPrimitive(date),
                    "bedtime_at" to JsonPrimitive("2026-10-04T23:31:20+00:00"),
                    "woke_at" to JsonPrimitive("2026-10-05T07:02:40+00:00"),
                    "times_source" to JsonPrimitive("health_connect"),
                    "external_id" to JsonPrimitive("hc-5"),
                    "asleep_min" to JsonPrimitive(420),
                    "deep_min" to JsonPrimitive(90),
                    "light_min" to JsonPrimitive(240),
                    "rem_min" to JsonPrimitive(90),
                    "awake_min" to JsonPrimitive(11),
                ),
            ),
        )
    }

    private fun upsert() = fake.callsOf<FakePostgrestGateway.Call.Upsert>().single()

    private val ratingKeys = setOf("workspace_id", "member_id", "date", "quality", "fatigue", "note")

    @Test
    fun `rating a device night sends only the ratings when the times are unchanged to the minute`() = runTest {
        seedDeviceNight()
        // The sheet prefills at minute precision: 23:31 and 07:02.
        val times = SleepTimes(Instant.parse("2026-10-04T23:31:00Z"), Instant.parse("2026-10-05T07:02:00Z"))

        val saved = repository().save(SleepRating(oct5, quality = 6, fatigue = 3, note = "slept well", times = times))

        val call = upsert()
        assertEquals("member_id,date", call.onConflict)
        val row = call.rows.single()
        assertEquals(ratingKeys, row.keys)
        assertEquals(JsonPrimitive(Fixtures.WS), row["workspace_id"])
        assertEquals(JsonPrimitive("2026-10-05"), row["date"])
        assertEquals(JsonPrimitive(6), row["quality"])
        assertEquals(JsonPrimitive(3), row["fatigue"])
        assertEquals(JsonPrimitive("slept well"), row["note"])
        // The device's times, source and stages are untouched.
        val stored = fake.rows(SupabaseTables.SLEEP_LOGS).single()
        assertEquals(JsonPrimitive("2026-10-04T23:31:20+00:00"), stored["bedtime_at"])
        assertEquals(JsonPrimitive("health_connect"), stored["times_source"])
        assertEquals(JsonPrimitive(90), stored["deep_min"])
        assertEquals(SleepTimesSource.HealthConnect, saved.timesSource)
        assertEquals(6, saved.quality)
        assertEquals(90, saved.deepMin)
    }

    @Test
    fun `blank times on a device night are not sent either`() = runTest {
        seedDeviceNight()

        repository().save(SleepRating(oct5, quality = 4, fatigue = null, note = null, times = SleepTimes(null, null)))

        val row = upsert().rows.single()
        assertEquals(ratingKeys, row.keys)
        assertEquals(JsonNull, row["fatigue"])
        assertEquals(JsonNull, row["note"])
    }

    @Test
    fun `times the member changed on a device night go through as manual`() = runTest {
        seedDeviceNight()
        val times = SleepTimes(Instant.parse("2026-10-04T22:45:00Z"), Instant.parse("2026-10-05T07:02:00Z"))

        val saved = repository().save(SleepRating(oct5, quality = 5, fatigue = 4, note = null, times = times))

        val row = upsert().rows.single()
        assertEquals(ratingKeys + setOf("bedtime_at", "woke_at", "times_source"), row.keys)
        assertEquals(JsonPrimitive("2026-10-04T22:45:00.000Z"), row["bedtime_at"])
        assertEquals(JsonPrimitive("2026-10-05T07:02:00.000Z"), row["woke_at"])
        assertEquals(JsonPrimitive("manual"), row["times_source"])
        assertEquals(SleepTimesSource.Manual, saved.timesSource)
        // Stages stay: the upsert never sent them.
        assertEquals(JsonPrimitive(240), fake.rows(SupabaseTables.SLEEP_LOGS).single()["light_min"])
    }

    @Test
    fun `no times leaves the stored ones alone`() = runTest {
        seedDeviceNight()

        repository().save(SleepRating(oct5, quality = 7, fatigue = 2, note = null, times = null))

        assertEquals(ratingKeys, upsert().rows.single().keys)
    }

    @Test
    fun `untouched default times never replace a night synced meanwhile`() = runTest {
        // The sheet opened before the sync landed, prefilled with 23:00 / 07:00.
        seedDeviceNight()
        val defaults = SleepTimes(Instant.parse("2026-10-04T21:00:00Z"), Instant.parse("2026-10-05T05:00:00Z"))

        repository().save(SleepRating(oct5, quality = 5, fatigue = null, note = null, times = defaults, timesEdited = false))

        assertEquals(ratingKeys, upsert().rows.single().keys)
        assertEquals(JsonPrimitive("health_connect"), fake.rows(SupabaseTables.SLEEP_LOGS).single()["times_source"])
    }

    @Test
    fun `a manual check-in on a night with no row sends its times`() = runTest {
        val times = SleepTimes(Instant.parse("2026-10-04T21:00:00Z"), Instant.parse("2026-10-05T05:00:00Z"))

        val saved = repository().save(SleepRating(oct5, quality = 3, fatigue = 6, note = "late dinner", times = times, timesEdited = false))

        val row = upsert().rows.single()
        assertEquals(JsonPrimitive("2026-10-04T21:00:00.000Z"), row["bedtime_at"])
        assertEquals(JsonPrimitive("manual"), row["times_source"])
        assertEquals(oct5, saved.date)
        assertEquals("late dinner", saved.note)
    }

    @Test
    fun `refresh reads the member's last 30 days, newest first, and a save updates them`() = runTest {
        seedDeviceNight(date = "2026-10-04")
        seedDeviceNight(date = "2026-10-05")
        seedDeviceNight(date = "2026-08-01")
        seedDeviceNight(member = "someone-else", date = "2026-10-05")
        val repo = repository()
        assertNull(repo.recentLogs.first())

        repo.refresh()

        val select = fake.callsOf<FakePostgrestGateway.Call.Select>().single()
        assertEquals(
            listOf(RowFilter.Eq("member_id", Fixtures.MEMBER_A), RowFilter.Gte("date", "2026-09-05")),
            select.filters,
        )
        assertEquals(listOf(LocalDate(2026, 10, 5), LocalDate(2026, 10, 4)), repo.recentLogs.first()?.map { it.date })
        assertEquals(null, repo.recentLogs.first()?.first()?.quality)

        repo.save(SleepRating(oct5, quality = 6, fatigue = null, note = null))

        assertEquals(6, repo.recentLogs.first()?.first()?.quality)
    }

    @Test
    fun `the check-in dismissal is per member`() = runTest {
        val anna = repository()
        assertNull(anna.checkinDismissedOn.first())

        anna.dismissCheckin(oct5)

        assertEquals(oct5, anna.checkinDismissedOn.first())
        assertNull(repository(member = "someone-else").checkinDismissedOn.first())
    }

    @Test
    fun `a read that was in flight never brings back a night saved after it`() = runTest {
        seedDeviceNight()
        val slow = SlowReads(fake)
        val repo = repository(gateway = slow)
        repo.refresh()
        assertEquals(null, repo.recentLogs.first()?.single()?.quality)

        // A read and a save race: the save waits for the read, then lands on top of it.
        val gate = CompletableDeferred<Unit>()
        slow.release = gate
        backgroundScope.launch { repo.refresh() }
        runCurrent()
        backgroundScope.launch { repo.save(SleepRating(oct5, quality = 6, fatigue = null, note = null)) }
        runCurrent()
        gate.complete(Unit)
        runCurrent()

        assertEquals(6, repo.recentLogs.first()?.single()?.quality)
    }

    @Test
    fun `two refreshes asked at once read once`() = runTest {
        seedDeviceNight()
        val slow = SlowReads(fake)
        val repo = repository(gateway = slow)
        val gate = CompletableDeferred<Unit>()
        slow.release = gate

        backgroundScope.launch { repo.refresh() }
        backgroundScope.launch { repo.refresh() }
        runCurrent()
        gate.complete(Unit)
        runCurrent()

        assertEquals(1, fake.callsOf<FakePostgrestGateway.Call.Select>().size)
        assertEquals(listOf(oct5), repo.recentLogs.first()?.map { it.date })
        // Asked again later: a fresh read.
        repo.refresh()
        assertEquals(2, fake.callsOf<FakePostgrestGateway.Call.Select>().size)
    }
}
