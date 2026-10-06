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
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
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
import page.planr.android.core.data.remote.EventMutations
import page.planr.android.core.data.remote.FakePostgrestGateway
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.MemberMutations
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.RowFilter
import page.planr.android.core.data.remote.RowOrder
import page.planr.android.core.data.remote.SelectPage
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.TaskMutations
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.core.model.TimeWindow

/**
 * The repositories' snapshot refreshes are coalesced ([RefreshCoalescer]):
 * concurrent callers share one fetch, a fetch moments ago is not repeated,
 * and a forced refresh always fetches.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RefreshCoalescingTest {
    private lateinit var db: PlanrDatabase
    private val gate = CacheGate()

    /** Counts the reads of each table; while [hold] is set, every read waits for it. */
    private val fake = FakePostgrestGateway().apply { seedAll() }
    private val gateway = object : PostgrestGateway by fake {
        val reads = mutableMapOf<String, Int>()
        var hold: CompletableDeferred<Unit>? = null
        var failWith: Exception? = null

        private suspend fun read(table: String) {
            reads[table] = (reads[table] ?: 0) + 1
            hold?.await()
            failWith?.let { throw it }
        }

        override suspend fun select(table: String, columns: String, filters: List<RowFilter>, order: List<RowOrder>, limit: Long?) =
            read(table).let { fake.select(table, columns, filters, order, limit) }

        override suspend fun selectPage(table: String, columns: String, filters: List<RowFilter>, order: List<RowOrder>, limit: Long): SelectPage =
            read(table).let { fake.selectPage(table, columns, filters, order, limit) }
    }

    @BeforeTest
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), PlanrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @AfterTest
    fun tearDown() = db.close()

    private fun reads(table: String) = gateway.reads[table] ?: 0

    @Test
    fun `concurrent window refreshes share one fetch`() = runTest {
        val repo = events()
        gateway.hold = CompletableDeferred()

        val calls = List(5) { async { repo.refreshWindow(june) } }
        runCurrent()
        gateway.hold!!.complete(Unit)
        calls.awaitAll()

        assertEquals(1, reads(SupabaseTables.EVENTS))
    }

    @Test
    fun `a window fetched moments ago is not fetched again, unless forced`() = runTest {
        val repo = events()
        repo.refreshWindow(june)

        now += RefreshCoalescer.FRESH_FOR - 1.seconds
        repo.refreshWindow(june)
        assertEquals(1, reads(SupabaseTables.EVENTS), "fresh: skipped")

        repo.refreshWindow(june, force = true)
        assertEquals(2, reads(SupabaseTables.EVENTS), "forced: fetched")
    }

    @Test
    fun `each window has its own freshness, and it runs out`() = runTest {
        val repo = events()
        repo.refreshWindow(june)
        repo.refreshWindow(july)
        assertEquals(2, reads(SupabaseTables.EVENTS))

        now += RefreshCoalescer.FRESH_FOR
        repo.refreshWindow(june)
        assertEquals(3, reads(SupabaseTables.EVENTS))
    }

    @Test
    fun `a wipe makes the last refresh stale`() = runTest {
        val repo = events()
        repo.refreshWindow(june)

        gate.wipe { db.clearAllTables() }
        repo.refreshWindow(june)

        assertEquals(2, reads(SupabaseTables.EVENTS))
    }

    @Test
    fun `the Realtime join outdates a refresh done before it`() = runTest {
        val repo = events()
        repo.refreshWindow(june)

        gate.outdateSnapshots()
        repo.refreshWindow(june)
        assertEquals(2, reads(SupabaseTables.EVENTS), "begun before the join: may miss what the channel never delivers")

        repo.refreshWindow(june)
        assertEquals(2, reads(SupabaseTables.EVENTS), "the one after it is fresh")
    }

    @Test
    fun `a refresh still running when Realtime joins is waited for, not joined`() = runTest {
        val repo = events()
        val hold = CompletableDeferred<Unit>()
        gateway.hold = hold
        val before = async { repo.refreshWindow(june) }
        runCurrent()

        gateway.hold = null
        gate.outdateSnapshots()
        val after = List(3) { async { repo.refreshWindow(june) } }
        runCurrent()
        assertEquals(1, reads(SupabaseTables.EVENTS), "the later callers wait for the older fetch first")

        hold.complete(Unit)
        before.await()
        after.awaitAll()
        assertEquals(2, reads(SupabaseTables.EVENTS), "then share one fetch of their own")
    }

    @Test
    fun `a slow refresh finishing doesn't forget a later one's freshness`() = runTest {
        val repo = events()
        val hold = CompletableDeferred<Unit>()
        gateway.hold = hold
        val slow = async { repo.refreshWindow(june) }
        runCurrent()
        gateway.hold = null

        now += 5.seconds
        repo.refreshWindow(july)
        hold.complete(Unit)
        slow.await()

        repo.refreshWindow(july)
        assertEquals(2, reads(SupabaseTables.EVENTS))
    }

    @Test
    fun `a failed refresh fails its joiners too, and doesn't count as fresh`() = runTest {
        val repo = events()
        gateway.hold = CompletableDeferred()
        gateway.failWith = IOException("offline")

        val calls = List(3) { async { runCatching { repo.refreshWindow(june) } } }
        runCurrent()
        gateway.hold!!.complete(Unit)
        val results = calls.awaitAll()
        assertEquals(3, results.count { it.exceptionOrNull() is IOException })
        assertEquals(1, reads(SupabaseTables.EVENTS))

        gateway.failWith = null
        repo.refreshWindow(june)
        assertEquals(2, reads(SupabaseTables.EVENTS))
    }

    @Test
    fun `a joiner outlives a cancelled leader by fetching itself`() = runTest {
        val repo = events()
        gateway.hold = CompletableDeferred()
        val leader = launch { repo.refreshWindow(june) }
        runCurrent()
        val joiner = async { repo.refreshWindow(june) }
        runCurrent()

        leader.cancel()
        runCurrent()
        gateway.hold!!.complete(Unit)
        joiner.await()

        assertEquals(2, reads(SupabaseTables.EVENTS))
        assertTrue(leader.isCancelled)
    }

    @Test
    fun `tasks - concurrent refreshes share one fetch, a fresh one is skipped, a forced one fetches`() = runTest {
        val repo = tasks()
        gateway.hold = CompletableDeferred()
        val calls = List(4) { async { repo.refresh() } }
        runCurrent()
        gateway.hold!!.complete(Unit)
        gateway.hold = null
        calls.awaitAll()
        assertEquals(1, reads(SupabaseTables.TASKS))

        repo.refresh()
        assertEquals(1, reads(SupabaseTables.TASKS))

        repo.refresh(force = true)
        assertEquals(2, reads(SupabaseTables.TASKS))
    }

    @Test
    fun `workspace - concurrent refreshes share one fetch, a fresh one is skipped, a forced one fetches`() = runTest {
        val repo = workspace()
        gateway.hold = CompletableDeferred()
        val calls = List(4) { async { repo.refresh() } }
        runCurrent()
        gateway.hold!!.complete(Unit)
        gateway.hold = null
        calls.awaitAll()
        assertEquals(1, reads(SupabaseTables.MEMBERS))

        repo.refresh()
        assertEquals(1, reads(SupabaseTables.MEMBERS))

        repo.refresh(force = true)
        assertEquals(2, reads(SupabaseTables.MEMBERS))
    }

    // --- fixtures ---

    private val june = TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z"))
    private val july = TimeWindow(Instant.parse("2026-07-01T00:00:00Z"), Instant.parse("2026-07-08T00:00:00Z"))

    /**
     * Moved by hand: runTest's virtual time also jumps ahead whenever the
     * test waits on Room's own threads, which would age every refresh.
     */
    private var now = Instant.parse("2026-06-01T12:00:00Z")
    private val clock = object : Clock {
        override fun now() = this@RefreshCoalescingTest.now
    }

    private fun TestScope.events() = EventRepository(
        session(), WorkspaceQueries(gateway), EventMutations(gateway), db, gate, widgets(), RefreshCoalescer(gate, clock),
    )

    private fun TestScope.tasks() = TaskRepository(
        session(), WorkspaceQueries(gateway), TaskMutations(gateway), db, gate, widgets(), clock, RefreshCoalescer(gate, clock),
    )

    private fun TestScope.workspace() = WorkspaceRepository(
        session(), WorkspaceQueries(gateway), MemberMutations(gateway), db.workspaceDao(), gate, widgets(), RefreshCoalescer(gate, clock),
    )

    private fun TestScope.widgets() = WidgetRefreshDispatcher(
        Provider { setOf(object : WidgetRefresher { override suspend fun refreshWidgets() = Unit }) },
        backgroundScope,
    )

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
        fun FakePostgrestGateway.seedAll() {
            seed(SupabaseTables.WORKSPACES, Fixtures.row("""{"id":"${Fixtures.WS}","name":"Home"}"""))
            seed(
                SupabaseTables.MEMBERS,
                Fixtures.row(
                    """
                    {"id":"${Fixtures.MEMBER_A}","workspace_id":"${Fixtures.WS}","name":"Anna","color":"#c0492a",
                     "timezone":"Europe/Berlin","secondary_timezone":null,"show_success_toasts":true}
                    """,
                ),
            )
            seed(SupabaseTables.EVENTS, Fixtures.eventRow())
            seed(SupabaseTables.TASKS, Fixtures.taskRow())
        }
    }
}
