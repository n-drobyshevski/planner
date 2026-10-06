@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.auth

import java.io.IOException
import java.net.URI
import java.net.URLDecoder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import page.planr.android.core.data.remote.MemberRef

class SessionManagerTest {

    private class MemoryStore : SessionStore {
        var session: StoredSession? = null
        var pending: PendingAuthorization? = null
        /** A broken disk or Keystore: every read / write throws. */
        var broken = false
        override suspend fun readSession(): StoredSession? {
            if (broken) throw IOException("unreadable")
            return session
        }
        override suspend fun writeSession(session: StoredSession?) {
            if (broken) throw IOException("disk full")
            this.session = session
        }
        override suspend fun readPending() = pending
        override suspend fun writePending(pending: PendingAuthorization?) { this.pending = pending }
    }

    private class FakeTokenClient(private val clock: () -> Instant) : OAuthTokenClient {
        var exchanges = mutableListOf<Triple<String, String, String>>()
        var refreshes = 0
        var refreshError: Exception? = null
        val revoked = mutableListOf<String>()

        override suspend fun exchangeCode(code: String, codeVerifier: String, redirectUri: String): OAuthTokens {
            exchanges += Triple(code, codeVerifier, redirectUri)
            return OAuthTokens(TestTokens.jwt(exp = clock().epochSeconds + 3600), refreshToken = "r0")
        }

        override suspend fun refresh(refreshToken: String): OAuthTokens {
            refreshes++
            delay(100) // a real round trip, so concurrent callers overlap
            refreshError?.let { throw it }
            return OAuthTokens(
                TestTokens.jwt(exp = clock().epochSeconds + 3600, extra = ""","n":$refreshes"""),
                refreshToken = "r$refreshes",
            )
        }

        override suspend fun revokeSession(accessToken: String) {
            revoked += accessToken
        }
    }

    private val store = MemoryStore()
    private var cleared = 0
    private var stateWhenCleared: AuthState? = null
    private lateinit var current: SessionManager
    private var member: MemberRef? = MemberRef("m1", "ws1")

    private fun TestScope.clock() = object : Clock {
        override fun now() = Instant.fromEpochMilliseconds(BASE_MS + testScheduler.currentTime)
    }

    private fun TestScope.manager(tokens: FakeTokenClient = FakeTokenClient(clock()::now)): SessionManager =
        SessionManager(
            config = TestTokens.config,
            store = store,
            tokenClient = tokens,
            memberLookup = { member },
            localData = {
                cleared++
                stateWhenCleared = current.authState.value
            },
            clock = clock(),
            scope = backgroundScope,
        ).also {
            current = it
            runCurrent()
        }

    private fun signedInSession(expiresInSec: Long) = StoredSession(
        accessToken = TestTokens.jwt(exp = BASE_MS / 1000 + expiresInSec),
        refreshToken = "r0",
        expiresAtEpochSec = BASE_MS / 1000 + expiresInSec,
        userId = "user-1",
        memberId = "m1",
        workspaceId = "ws1",
    )

    private fun stateOf(url: String): String = URI(url).rawQuery.split('&')
        .first { it.startsWith("state=") }
        .substringAfter('=')
        .let { URLDecoder.decode(it, "UTF-8") }

    private val callback = TestTokens.config.authCallbackUrl

    @Test
    fun `restores a stored session, or starts signed out`() = runTest {
        assertEquals(AuthState.SignedOut(), manager().authState.value)

        store.session = signedInSession(3600)
        val restored = manager()
        assertEquals(AuthState.SignedIn(SessionInfo("user-1", "m1", "ws1")), restored.authState.value)
        assertEquals(store.session!!.accessToken, restored.accessToken())
    }

    @Test
    fun `full sign-in exchanges the code with the stored verifier`() = runTest {
        val tokens = FakeTokenClient(clock()::now)
        val manager = manager(tokens)
        val url = manager.beginSignIn()
        val pending = assertNotNull(store.pending)

        val error = manager.completeSignIn("$callback?code=the-code&state=${stateOf(url)}")

        assertNull(error)
        assertEquals(Triple("the-code", pending.codeVerifier, callback), tokens.exchanges.single())
        assertEquals(AuthState.SignedIn(SessionInfo("user-1", "m1", "ws1")), manager.authState.value)
        assertEquals("m1", store.session?.memberId)
        assertNull(store.pending) // single use
        assertEquals(SignInProgress.Idle, manager.signInProgress.value)
    }

    @Test
    fun `a callback with the wrong state is ignored and leaves the real request usable`() = runTest {
        val manager = manager()
        val url = manager.beginSignIn()

        assertEquals(SignInError.StateMismatch, manager.completeSignIn("$callback?code=x&state=forged"))
        assertEquals(SignInProgress.Failed(SignInError.StateMismatch), manager.signInProgress.value)
        assertNull(store.session)

        assertNull(manager.completeSignIn("$callback?code=x&state=${stateOf(url)}"))
    }

    @Test
    fun `callback without a started sign-in, after expiry, or denied`() = runTest {
        val manager = manager()
        assertEquals(SignInError.NoPendingRequest, manager.completeSignIn("$callback?code=x&state=s"))

        var url = manager.beginSignIn()
        advanceTimeBy(16.minutes)
        assertEquals(SignInError.Expired, manager.completeSignIn("$callback?code=x&state=${stateOf(url)}"))

        url = manager.beginSignIn()
        assertEquals(
            SignInError.Denied,
            manager.completeSignIn("$callback?error=access_denied&state=${stateOf(url)}"),
        )
    }

    @Test
    fun `an account without a member is not signed in`() = runTest {
        member = null
        val manager = manager()
        val url = manager.beginSignIn()

        assertEquals(SignInError.NoMember, manager.completeSignIn("$callback?code=x&state=${stateOf(url)}"))
        assertNull(store.session)
        assertNull(manager.accessToken())
        assertEquals(AuthState.SignedOut(), manager.authState.value)
    }

    @Test
    fun `concurrent callers near expiry share one refresh`() = runTest {
        store.session = signedInSession(expiresInSec = 30) // inside the 60 s leeway
        val tokens = FakeTokenClient(clock()::now)
        val manager = manager(tokens)

        val results = List(3) { async { manager.accessToken() } }.awaitAll()

        assertEquals(1, tokens.refreshes)
        assertEquals(1, results.toSet().size)
        assertEquals(store.session?.accessToken, results.first())
        assertEquals("r1", store.session?.refreshToken) // rotated token persisted
    }

    @Test
    fun `a rejected refresh signs out and wipes local data`() = runTest {
        store.session = signedInSession(expiresInSec = 30)
        val tokens = FakeTokenClient(clock()::now).apply { refreshError = OAuthException(400, "invalid_grant", null) }
        val manager = manager(tokens)

        assertNull(manager.accessToken())
        assertEquals(AuthState.SignedOut(SignOutReason.SessionExpired), manager.authState.value)
        assertNull(store.session)
        assertEquals(1, cleared)
        // Widgets re-rendered by the wipe already see "signed out", not an empty day.
        assertEquals(AuthState.SignedOut(SignOutReason.SessionExpired), stateWhenCleared)
    }

    @Test
    fun `a rate-limited refresh keeps the session`() = runTest {
        store.session = signedInSession(expiresInSec = 30)
        val tokens = FakeTokenClient(clock()::now).apply {
            refreshError = OAuthException(429, "over_request_rate_limit", null)
        }
        val manager = manager(tokens)

        assertEquals(store.session?.accessToken, manager.accessToken())
        assertEquals(AuthState.SignedIn(SessionInfo("user-1", "m1", "ws1")), manager.authState.value)
        assertEquals(0, cleared)
    }

    @Test
    fun `a 401 forces one refresh even while the token looks valid`() = runTest {
        store.session = signedInSession(expiresInSec = 3600)
        val tokens = FakeTokenClient(clock()::now)
        val manager = manager(tokens)
        val rejected = manager.accessToken()

        val retried = manager.refreshRejected(rejected)
        assertEquals(1, tokens.refreshes)
        assertEquals(store.session?.accessToken, retried)
        // A second caller holding the same stale token reuses the new one.
        assertEquals(retried, manager.refreshRejected(rejected))
        assertEquals(1, tokens.refreshes)
    }

    @Test
    fun `a sign-out during a refresh is not undone by it`() = runTest {
        store.session = signedInSession(expiresInSec = 30)
        val tokens = FakeTokenClient(clock()::now)
        val manager = manager(tokens)

        val refreshing = async { manager.accessToken() }
        runCurrent() // the refresh request is in flight
        val signingOut = async { manager.signOut() }
        refreshing.await()
        signingOut.await()

        assertEquals(AuthState.SignedOut(SignOutReason.UserRequested), manager.authState.value)
        assertNull(store.session)
        assertNull(manager.accessToken())
    }

    @Test
    fun `an offline refresh keeps the session and the still-valid token`() = runTest {
        store.session = signedInSession(expiresInSec = 30)
        val tokens = FakeTokenClient(clock()::now).apply { refreshError = IOException("offline") }
        val manager = manager(tokens)

        assertEquals(store.session?.accessToken, manager.accessToken())
        assertEquals(AuthState.SignedIn(SessionInfo("user-1", "m1", "ws1")), manager.authState.value)
    }

    @Test
    fun `an unreadable store starts signed out instead of crashing`() = runTest {
        store.session = signedInSession(3600)
        store.broken = true
        assertEquals(AuthState.SignedOut(), manager().authState.value)
    }

    @Test
    fun `rotated tokens that can't be stored still replace the in-memory session`() = runTest {
        val old = signedInSession(expiresInSec = 30)
        store.session = old
        val tokens = FakeTokenClient(clock()::now)
        val manager = manager(tokens)
        store.broken = true

        val fresh = manager.accessToken()

        assertEquals(1, tokens.refreshes)
        assertNotNull(fresh)
        assertNotEquals(old.accessToken, fresh)
        assertEquals(AuthState.SignedIn(SessionInfo("user-1", "m1", "ws1")), manager.authState.value)
        // The spent refresh token isn't used again: the new one lives in memory.
        assertEquals(fresh, manager.accessToken())
        assertEquals(1, tokens.refreshes)
    }

    @Test
    fun `refreshes proactively before expiry`() = runTest {
        store.session = signedInSession(expiresInSec = 3600)
        val tokens = FakeTokenClient(clock()::now)
        manager(tokens)

        advanceTimeBy(58.minutes)
        assertEquals(0, tokens.refreshes)
        advanceTimeBy(1.minutes + 1.seconds)
        runCurrent()
        assertEquals(1, tokens.refreshes)
    }

    @Test
    fun `sign-out clears tokens and the cache and ends the server session`() = runTest {
        store.session = signedInSession(3600)
        val token = store.session!!.accessToken
        val tokens = FakeTokenClient(clock()::now)
        val manager = manager(tokens)
        manager.signOut()
        runCurrent()
        assertEquals(AuthState.SignedOut(SignOutReason.UserRequested), manager.authState.value)
        assertEquals(AuthState.SignedOut(SignOutReason.UserRequested), stateWhenCleared)
        assertNull(store.session)
        assertNull(manager.accessToken())
        assertEquals(1, cleared)
        assertEquals(listOf(token), tokens.revoked)
    }

    private companion object {
        const val BASE_MS = 1_780_000_000_000L
    }
}
