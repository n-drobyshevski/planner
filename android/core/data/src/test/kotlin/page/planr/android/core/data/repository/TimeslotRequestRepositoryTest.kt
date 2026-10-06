@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.repository

import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.auth.OAuthTokenClient
import page.planr.android.core.data.auth.OAuthTokens
import page.planr.android.core.data.auth.PendingAuthorization
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SessionStore
import page.planr.android.core.data.auth.StoredSession
import page.planr.android.core.data.auth.TestTokens
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.model.TimeslotRequestStatus
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.RowFilter
import page.planr.android.core.data.remote.RowOrder
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.TimeslotRequestsRemote

/** The Inbox's timeslot requests over a fake PostgREST: the web's read, the status write, the optimistic list. */
class TimeslotRequestRepositoryTest {
    private val fake = FakePostgrestGateway()

    private var now = Instant.parse("2026-10-06T09:00:00Z")
    private val clock = object : Clock {
        override fun now(): Instant = now
    }
    private val gate = CacheGate()

    private fun requestRow(id: String, created: String, status: String = "pending", name: String? = "Jordan") = Fixtures.row(
        """
        {"id":"$id","share_id":"share-1","workspace_id":"${Fixtures.WS}","owner_id":"${Fixtures.MEMBER_A}",
         "requester_name":${name?.let { "\"$it\"" } ?: "null"},"message":null,
         "proposed_start":"2026-10-08T13:00:00+00:00","proposed_end":"2026-10-08T14:00:00+00:00",
         "status":"$status","created_at":"$created","resolved_at":null}
        """,
    )

    private fun seed() {
        fake.seed(
            SupabaseTables.TIMESLOT_REQUESTS,
            requestRow("r-old", "2026-10-04T10:00:00.123456+00:00"),
            requestRow("r-new", "2026-10-05T10:00:00+00:00", name = null),
            requestRow("r-done", "2026-10-05T11:00:00+00:00", status = "declined"),
        )
    }

    private fun TestScope.repository(gateway: PostgrestGateway = fake): RemoteTimeslotRequestRepository =
        RemoteTimeslotRequestRepository(TimeslotRequestsRemote(gateway), session(), clock, gate)

    private fun TestScope.session(): SessionManager {
        val stored = object : SessionStore {
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
        return SessionManager(TestTokens.config, stored, noTokens, { null }, { }, Clock.System, backgroundScope)
            .also { runCurrent() }
    }

    /** Fails every UPDATE, as an offline write would. */
    private class FailingUpdates(private val inner: FakePostgrestGateway) : PostgrestGateway by inner {
        override suspend fun update(table: String, patch: JsonObject, filters: List<RowFilter>): List<JsonObject> =
            throw IOException("offline")
    }

    @Test
    fun `reads the workspace's pending requests newest first, as fetchTimeslotRequests does`() = runTest {
        seed()
        val repo = repository()
        assertNull(repo.pending.first())

        repo.refresh()

        val select = fake.callsOf<FakePostgrestGateway.Call.Select>().single()
        assertEquals(SupabaseTables.TIMESLOT_REQUESTS, select.table)
        assertEquals("*", select.columns)
        assertEquals(listOf<RowFilter>(RowFilter.Eq("workspace_id", Fixtures.WS), RowFilter.Eq("status", "pending")), select.filters)
        assertEquals(listOf(RowOrder("created_at", ascending = false)), select.order)
        val pending = repo.pending.first()!!
        assertEquals(listOf("r-new", "r-old"), pending.map { it.id })
        assertNull(pending[0].requesterName)
        assertEquals(Instant.parse("2026-10-08T13:00:00Z"), pending[0].proposedStart)
        assertEquals(TimeslotRequestStatus.Pending, pending[0].status)
    }

    @Test
    fun `approving writes the status and resolved_at and drops the row`() = runTest {
        seed()
        val repo = repository()
        repo.refresh()

        repo.markApproved("r-old")

        val update = fake.callsOf<FakePostgrestGateway.Call.Update>().single()
        assertEquals(SupabaseTables.TIMESLOT_REQUESTS, update.table)
        assertEquals(
            buildJsonObject {
                put("status", "approved")
                put("resolved_at", "2026-10-06T09:00:00.000Z")
            },
            update.patch,
        )
        assertEquals(listOf<RowFilter>(RowFilter.Eq("id", "r-old")), update.filters)
        assertEquals(listOf("r-new"), repo.pending.first()!!.map { it.id })
        // The server agrees: a fresh read no longer has it.
        repo.refresh()
        assertEquals(listOf("r-new"), repo.pending.first()!!.map { it.id })
    }

    @Test
    fun `declining writes declined`() = runTest {
        seed()
        val repo = repository()
        repo.refresh()

        repo.markDeclined("r-new")

        val update = fake.callsOf<FakePostgrestGateway.Call.Update>().single()
        assertEquals(JsonPrimitive("declined"), update.patch["status"])
        assertEquals(listOf("r-old"), repo.pending.first()!!.map { it.id })
    }

    @Test
    fun `a failed write puts the request back and rethrows`() = runTest {
        seed()
        val repo = repository(FailingUpdates(fake))
        repo.refresh()

        assertFailsWith<IOException> { repo.markDeclined("r-new") }

        assertEquals(listOf("r-new", "r-old"), repo.pending.first()!!.map { it.id })
    }

    @Test
    fun `an unforced refresh skips a read done moments ago`() = runTest {
        seed()
        val repo = repository()
        fun reads() = fake.callsOf<FakePostgrestGateway.Call.Select>().size

        repo.refresh()
        repo.refresh(force = false)
        assertEquals(1, reads())

        // Forced (the Inbox opening): always read.
        repo.refresh()
        assertEquals(2, reads())

        now += 31.seconds
        repo.refresh(force = false)
        assertEquals(3, reads())

        // A sign-out wipe makes the last read stale at once.
        gate.wipe { }
        repo.refresh(force = false)
        assertEquals(4, reads())
    }
}
