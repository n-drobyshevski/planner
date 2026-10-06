@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.health

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.auth.OAuthTokenClient
import page.planr.android.core.data.auth.OAuthTokens
import page.planr.android.core.data.auth.PendingAuthorization
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SessionStore
import page.planr.android.core.data.auth.StoredSession
import page.planr.android.core.data.auth.TestTokens
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.SleepRemote
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/** [HealthSleepSync] over a fake Health Connect, a fake PostgREST and an in-memory store. */
class HealthSleepSyncTest {
    private val fake = FakePostgrestGateway()
    private var offline = false
    private val gateway = object : PostgrestGateway by fake {
        override suspend fun upsert(table: String, rows: List<JsonObject>, onConflict: String): List<JsonObject> {
            if (offline) throw IOException("offline")
            return fake.upsert(table, rows, onConflict)
        }
    }

    private val zone = ZoneId.of("Europe/Berlin")
    private val plus2 = ZoneOffset.ofHours(2)

    /** 5 October 2026, 09:00 in Berlin. */
    private var now = LocalDate.of(2026, 10, 5).atTime(9, 0).toInstant(plus2)
    private val clock = object : Clock {
        override fun now(): Instant = Instant.fromEpochMilliseconds(now.toEpochMilli())
    }

    private class FakeSource : HealthSleepSource {
        var sessions = listOf<HealthSleepSession>()
        var granted = true
        var history = false
        var revoked = false
        val reads = mutableListOf<Pair<java.time.Instant, java.time.Instant>>()

        override fun availability() = HealthAvailability.Available
        override fun permissionsToRequest() = setOf("sleep")
        override suspend fun hasReadPermission() = granted
        override suspend fun historyGranted() = history
        override suspend fun read(from: java.time.Instant, to: java.time.Instant): List<HealthSleepSession> {
            if (!granted) throw SecurityException("no access")
            reads += from to to
            return sessions.filter { it.end > from && it.start < to }
        }
        override suspend fun revoke() {
            revoked = true
        }
    }

    private class MemoryDataStore : DataStore<Preferences> {
        private val state = MutableStateFlow(emptyPreferences())
        private val mutex = Mutex()
        override val data: Flow<Preferences> = state
        override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
            mutex.withLock { transform(state.value).also { state.value = it } }
    }

    /** A calendar holding [blocks]; records what the sync did to it. */
    private class FakeCalendar : SleepBlockCalendar {
        var blocks = listOf<Occurrence>()
        val actions = mutableListOf<String>()
        override suspend fun occurrences(window: TimeWindow, zoneId: String) =
            blocks.filter { window.intersects(it.start, it.end) }
        override suspend fun create(workspaceId: String, ownerId: String, start: Instant, end: Instant, zoneId: String, sleepCategoryId: String?) {
            actions += "create $start $end ${sleepCategoryId ?: "inactive"}"
        }
        override suspend fun move(eventId: String, start: Instant, end: Instant) {
            actions += "move $eventId $start $end"
        }
        override suspend fun moveOccurrence(eventId: String, occurrenceDate: Instant, start: Instant, end: Instant) {
            actions += "override $eventId $start $end"
        }
    }

    private val calendar = FakeCalendar()
    private val source = FakeSource()
    private val store = MemoryDataStore()

    private fun TestScope.sync(member: String = Fixtures.MEMBER_A): HealthSleepSync =
        HealthSleepSync(source, SleepRemote(gateway), calendar, session(member), store, clock, backgroundScope)
            .also { it.zone = { zone } }

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

    /** A 7.5 h night ending on [day] October at 07:00 (UTC+2), half light, a quarter each deep and REM. */
    private fun night(day: Int, id: String = "hc-$day"): HealthSleepSession {
        val wake = LocalDate.of(2026, 10, day).atTime(7, 0).toInstant(plus2)
        val bed = wake.minusSeconds(450 * 60)
        val mid = bed.plusSeconds(225 * 60)
        val late = mid.plusSeconds(112 * 60 + 30)
        return HealthSleepSession(
            id = id,
            start = bed,
            end = wake,
            endOffset = plus2,
            stages = listOf(
                HealthSleepStage(bed, mid, SleepStageKind.Light),
                HealthSleepStage(mid, late, SleepStageKind.Deep),
                HealthSleepStage(late, wake, SleepStageKind.Rem),
            ),
        )
    }

    private fun upserts() = fake.callsOf<FakePostgrestGateway.Call.Upsert>()

    @Test
    fun `connecting imports the last 30 days with only the device's columns`() = runTest {
        val longAgo = 40L * 86400
        val old = night(5).let { it.copy(id = "old", start = it.start.minusSeconds(longAgo), end = it.end.minusSeconds(longAgo)) }
        source.sessions = listOf(night(4), night(5), old)
        val sync = sync()

        val result = sync.connect()

        assertEquals(HealthSyncResult.Synced(nights = 2, written = 2, blocks = 2), result)
        // 30 days back, plus a day so the first night is read whole.
        assertEquals(now.minusSeconds(31L * 86400), source.reads.single().first)
        val upsert = upserts().single()
        assertEquals("member_id,date", upsert.onConflict)
        val row = upsert.rows.first { it["date"] == JsonPrimitive("2026-10-05") }
        assertEquals(
            setOf(
                "workspace_id", "member_id", "date", "bedtime_at", "woke_at", "times_source", "external_id",
                "asleep_min", "deep_min", "light_min", "rem_min", "awake_min",
            ),
            row.keys,
        )
        assertEquals(JsonPrimitive("health_connect"), row["times_source"])
        assertEquals(JsonPrimitive("2026-10-04T21:30:00.000Z"), row["bedtime_at"])
        assertEquals(JsonPrimitive(450), row["asleep_min"])
        assertTrue(sync.status.first().connected)
    }

    @Test
    fun `the member's ratings on a night survive the import`() = runTest {
        fake.seed(
            SupabaseTables.SLEEP_LOGS,
            JsonObject(
                mapOf(
                    "workspace_id" to JsonPrimitive(Fixtures.WS),
                    "member_id" to JsonPrimitive(Fixtures.MEMBER_A),
                    "date" to JsonPrimitive("2026-10-05"),
                    "bedtime_at" to JsonPrimitive("2026-10-04T21:00:00+00:00"),
                    "woke_at" to JsonPrimitive("2026-10-05T04:00:00+00:00"),
                    "times_source" to JsonPrimitive("manual"),
                    "quality" to JsonPrimitive(6),
                    "note" to JsonPrimitive("slept well"),
                ),
            ),
        )
        source.sessions = listOf(night(5))

        sync().connect()

        val stored = fake.rows(SupabaseTables.SLEEP_LOGS).single()
        assertEquals(JsonPrimitive(6), stored["quality"])
        assertEquals(JsonPrimitive("slept well"), stored["note"])
        // Device times win over the typed ones.
        assertEquals(JsonPrimitive("2026-10-04T21:30:00.000Z"), stored["bedtime_at"])
        assertEquals(JsonPrimitive("health_connect"), stored["times_source"])
    }

    @Test
    fun `a later sync re-reads from two days before the last and skips unchanged nights`() = runTest {
        source.sessions = listOf(night(4), night(5))
        val sync = sync()
        sync.connect()
        val firstSync = now

        source.sessions = listOf(night(4), night(5), night(6))
        now = LocalDate.of(2026, 10, 6).atTime(9, 0).toInstant(plus2)
        val result = sync.sync()

        assertEquals(firstSync.minusSeconds(48L * 3600).minusSeconds(86400), source.reads.last().first)
        assertIs<HealthSyncResult.Synced>(result)
        assertEquals(1, result.written)
        assertEquals(listOf(JsonPrimitive("2026-10-06")), upserts().last().rows.map { it["date"] })
    }

    @Test
    fun `nothing syncs before connecting, or for another member`() = runTest {
        source.sessions = listOf(night(5))
        assertEquals(HealthSyncResult.NotConnected, sync().sync())
        assertTrue(source.reads.isEmpty())

        sync(member = Fixtures.MEMBER_A).connect()
        val other = sync(member = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
        assertEquals(HealthSyncResult.NotConnected, other.sync())
        assertFalse(other.status.first().connected)
    }

    @Test
    fun `withdrawn access disconnects and says so`() = runTest {
        source.sessions = listOf(night(5))
        val sync = sync()
        sync.connect()

        source.granted = false
        assertEquals(HealthSyncResult.NotConnected, sync.sync())

        val status = sync.status.first()
        assertFalse(status.connected)
        assertEquals(HealthSyncProblem.PermissionLost, status.problem)
    }

    @Test
    fun `a failed upload is reported and retried on the next sync`() = runTest {
        source.sessions = listOf(night(5))
        val sync = sync()
        offline = true

        assertEquals(HealthSyncResult.Failed, sync.connect())
        assertEquals(HealthSyncProblem.Failed, sync.status.first().problem)
        assertNull(sync.status.first().lastSyncAt)

        offline = false
        assertEquals(HealthSyncResult.Synced(nights = 1, written = 1, blocks = 1), sync.sync())
        assertNull(sync.status.first().problem)
    }

    @Test
    fun `coming to the foreground syncs when the last sync is stale`() = runTest {
        source.sessions = listOf(night(5))
        val sync = sync()
        sync.connect()
        val foreground = MutableStateFlow(false)
        sync.start(foreground)
        runCurrent()

        foreground.value = true
        runCurrent()
        assertEquals(1, source.reads.size) // synced a moment ago: not due

        foreground.value = false
        runCurrent()
        now = now.plusSeconds(20 * 60)
        foreground.value = true
        runCurrent()
        assertEquals(2, source.reads.size)
    }

    @Test
    fun `disconnect revokes access and sign-out forgets the connection`() = runTest {
        val sync = sync()
        sync.connect()
        sync.disconnect()
        assertTrue(source.revoked)
        assertFalse(sync.status.first().connected)

        sync.connect()
        sync.clearLocal()
        assertFalse(sync.status.first().connected)
    }

    private fun sleepBlock(id: String, start: String, end: String, recurring: Boolean = false) = Occurrence(
        key = id, eventId = id, occurrenceDate = Instant.parse(start), start = Instant.parse(start), end = Instant.parse(end),
        allDay = false, inactive = true, status = EventStatus.Confirmed, title = "Sleep", description = null, location = null,
        categoryId = null, color = null, kind = EventKind.Event, ownerId = Fixtures.MEMBER_A, isPrivate = false,
        isShared = false, hiddenFromPublic = false, taskId = null, attributes = JsonObject(emptyMap()),
        isRecurring = recurring, isException = false,
    )

    @Test
    fun `the last four nights snap their sleep blocks, older ones are left alone`() = runTest {
        // Nights ending 1–5 October; today is the 5th, so the 2nd–5th are recent.
        source.sessions = (1..5).map { night(it) }
        calendar.blocks = listOf(
            sleepBlock("routine-5", "2026-10-04T20:00:00Z", "2026-10-05T04:00:00Z", recurring = true),
            sleepBlock("single-4", "2026-10-03T22:00:00Z", "2026-10-04T05:30:00Z"),
            sleepBlock("same-3", "2026-10-02T21:30:00Z", "2026-10-03T05:00:00Z"),
        )

        val result = sync().connect()

        assertIs<HealthSyncResult.Synced>(result)
        assertEquals(3, result.blocks)
        assertEquals(
            listOf(
                "create 2026-10-01T21:30:00Z 2026-10-02T05:00:00Z inactive",
                "move single-4 2026-10-03T21:30:00Z 2026-10-04T05:00:00Z",
                "override routine-5 2026-10-04T21:30:00Z 2026-10-05T05:00:00Z",
            ),
            calendar.actions,
        )
    }

    @Test
    fun `a re-sync with the same times leaves blocks moved by hand alone`() = runTest {
        source.sessions = listOf(night(5))
        val sync = sync()
        sync.connect()
        calendar.actions.clear()
        calendar.blocks = listOf(sleepBlock("moved", "2026-10-04T23:00:00Z", "2026-10-05T06:00:00Z"))

        now = now.plusSeconds(3600)
        val result = sync.sync()

        assertIs<HealthSyncResult.Synced>(result)
        assertEquals(0, result.blocks)
        assertTrue(calendar.actions.isEmpty())
    }

    @Test
    fun `turning off the auto-adjust setting keeps the calendar untouched`() = runTest {
        fake.seed(
            SupabaseTables.MEMBER_SLEEP_PREFS,
            JsonObject(
                mapOf(
                    "member_id" to JsonPrimitive(Fixtures.MEMBER_A),
                    "auto_adjust_sleep_on_feedback" to JsonPrimitive(false),
                ),
            ),
        )
        source.sessions = listOf(night(5))

        sync().connect()

        assertTrue(calendar.actions.isEmpty())
    }

    @Test
    fun `a dedicated sleep category files the new block there`() = runTest {
        fake.seed(
            SupabaseTables.MEMBER_SLEEP_PREFS,
            JsonObject(
                mapOf(
                    "member_id" to JsonPrimitive(Fixtures.MEMBER_A),
                    "sleep_category_id" to JsonPrimitive("cat-sleep"),
                ),
            ),
        )
        source.sessions = listOf(night(5))
        // An inactive block that isn't in the sleep category doesn't count.
        calendar.blocks = listOf(sleepBlock("inactive", "2026-10-04T20:00:00Z", "2026-10-05T04:00:00Z"))

        sync().connect()

        assertEquals(listOf("create 2026-10-04T21:30:00Z 2026-10-05T05:00:00Z cat-sleep"), calendar.actions)
    }
}
