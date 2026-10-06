package page.planr.android.core.data.auth

import android.util.Log
import java.security.MessageDigest
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import page.planr.android.core.data.config.PlanrConfig
import page.planr.android.core.data.di.ApplicationScope

/**
 * Owns the OAuth session: Custom Tab sign-in (authorization code + PKCE),
 * token storage, proactive refresh and sign-out.
 *
 * - [beginSignIn] persists a fresh PKCE verifier + `state` and returns the
 *   `/oauth/authorize` URL to open in a Custom Tab.
 * - [handleCallback] takes the App Link (`/app/auth/callback`), checks
 *   `state`, exchanges the code, resolves the member like `verifyMcpToken`
 *   (lib/mcp/auth.ts) and stores everything encrypted.
 * - [accessToken] is what supabase-kt calls before every PostgREST request and
 *   Realtime join. It refreshes when the token is within [REFRESH_LEEWAY] of
 *   expiry; a [Mutex] makes concurrent callers share one refresh (refresh
 *   tokens rotate, so a second parallel refresh would fail). A rejected
 *   refresh signs the user out with [SignOutReason.SessionExpired].
 * - [refreshRejected] forces a refresh when the server answered 401 anyway
 *   (a revoked token, or a device clock far off the server's).
 * - [signOut] is the user's "Sign out": local wipe plus a best-effort
 *   server-side logout.
 */
@Singleton
class SessionManager @Inject constructor(
    private val config: PlanrConfig,
    private val store: SessionStore,
    private val tokenClient: OAuthTokenClient,
    private val memberLookup: MemberLookup,
    private val localData: LocalDataCleaner,
    private val clock: Clock,
    @ApplicationScope private val scope: CoroutineScope,
) : AccessTokenSource {

    private val random = SecureRandom()
    private val refreshMutex = Mutex()
    private val stateMutex = Mutex()

    private val session = MutableStateFlow<StoredSession?>(null)

    private val _authState = MutableStateFlow<AuthState>(
        if (config.isConfigured) AuthState.Loading else AuthState.Unconfigured,
    )
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _signInProgress = MutableStateFlow<SignInProgress>(SignInProgress.Idle)
    val signInProgress: StateFlow<SignInProgress> = _signInProgress.asStateFlow()

    /** Emits each new access token (null when signed out), e.g. to re-auth Realtime. */
    val accessTokens: Flow<String?> = session.map { it?.accessToken }.distinctUntilChanged()

    /** The signed-in member, or null. */
    val currentSession: SessionInfo?
        get() = (authState.value as? AuthState.SignedIn)?.session

    init {
        if (config.isConfigured) {
            scope.launch {
                restore()
                refreshAheadOfExpiry()
            }
        }
    }

    /** The signed-in session, or throws [NotSignedInException]. */
    fun requireSession(): SessionInfo = currentSession ?: throw NotSignedInException()

    /** Starts a sign-in: persists PKCE + state and returns the authorize URL. */
    suspend fun beginSignIn(): String {
        check(config.isConfigured) { "Supabase / OAuth config is missing from this build." }
        val pkce = Pkce.generate(random)
        val pending = PendingAuthorization(
            state = Pkce.newState(random),
            codeVerifier = pkce.verifier,
            redirectUri = config.authCallbackUrl,
            createdAtEpochMs = clock.now().toEpochMilliseconds(),
        )
        store.writePending(pending)
        _signInProgress.value = SignInProgress.Idle
        return buildAuthorizeUrl(config, pending)
    }

    /**
     * Routes an incoming App Link. Returns false when [uri] isn't our auth
     * callback; otherwise completes the sign-in in the background (progress on
     * [signInProgress]) so an activity recreation can't cancel the exchange.
     */
    fun handleCallback(uri: String): Boolean {
        if (!AuthCallbackParser.matches(uri, config.authCallbackUrl)) return false
        scope.launch { completeSignIn(uri) }
        return true
    }

    /** The sign-in completion behind [handleCallback]; returns the error, null on success. */
    suspend fun completeSignIn(uri: String): SignInError? = stateMutex.withLock {
        _signInProgress.value = SignInProgress.Completing
        val error = runCatchingSignIn { exchange(uri) }
        _signInProgress.value = if (error == null) SignInProgress.Idle else SignInProgress.Failed(error)
        error
    }

    /** Clears the failure shown on the sign-in screen. */
    fun dismissSignInError() {
        if (_signInProgress.value is SignInProgress.Failed) _signInProgress.value = SignInProgress.Idle
    }

    override suspend fun accessToken(): String? {
        val current = session.value ?: return null
        if (!current.expiresWithin(REFRESH_LEEWAY, clock.now())) return current.accessToken
        return refreshMutex.withLock {
            // Another caller may have refreshed while we waited for the lock.
            val latest = session.value ?: return@withLock null
            if (!latest.expiresWithin(REFRESH_LEEWAY, clock.now())) latest.accessToken else refresh(latest)
        }
    }

    override suspend fun refreshRejected(rejected: String?): String? = refreshMutex.withLock {
        val latest = session.value ?: return@withLock null
        // Someone else already replaced the rejected token: retry with theirs.
        if (latest.accessToken != rejected) latest.accessToken else refresh(latest)
    }

    /**
     * Signs out: forgets the tokens, wipes the local cache and, best effort,
     * ends the session on the server so a copied refresh token is useless.
     *
     * Holds [refreshMutex] too (always after [stateMutex], the order
     * [completeSignIn] takes them in), so an in-flight refresh can't store its
     * rotated tokens after the sign-out cleared them.
     */
    suspend fun signOut(reason: SignOutReason = SignOutReason.UserRequested) = stateMutex.withLock {
        refreshMutex.withLock {
            val accessToken = session.value?.accessToken
            clearSession(reason)
            if (accessToken != null) {
                // Not awaited: signing out must work offline and never hang on the network.
                scope.launch { runCatching { tokenClient.revokeSession(accessToken) } }
            }
        }
    }

    /**
     * Under [stateMutex]: a cold start from the App Link launches
     * [completeSignIn] right behind this, and the restore must not overwrite
     * the fresh sign-in with "signed out".
     */
    private suspend fun restore() = stateMutex.withLock {
        val stored = try {
            store.readSession()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // An unreadable store is "signed out", never a stuck Loading.
            Log.w(TAG, "Couldn't restore the session", e)
            null
        }
        val info = stored?.info()
        if (stored != null && info != null) {
            session.value = stored
            _authState.value = AuthState.SignedIn(info)
        } else {
            if (stored != null) persist(null) // a half-finished sign-in
            _authState.value = AuthState.SignedOut()
        }
    }

    private suspend fun exchange(uri: String): SignInError? {
        if (!config.isConfigured) return SignInError.NotConfigured
        val callback = AuthCallbackParser.parse(uri) ?: return SignInError.Rejected
        val pending = store.readPending() ?: return SignInError.NoPendingRequest
        if (!constantTimeEquals(callback.state, pending.state)) return SignInError.StateMismatch
        // The state matched: this request is used up, whatever happens next.
        store.writePending(null)

        val age = clock.now().toEpochMilliseconds() - pending.createdAtEpochMs
        if (age > PENDING_TTL.inWholeMilliseconds) return SignInError.Expired

        val code = when (callback) {
            is AuthCallback.Failure ->
                return if (callback.error == "access_denied") SignInError.Denied else SignInError.Rejected
            is AuthCallback.Code -> callback.code
        }
        val tokens = tokenClient.exchangeCode(code, pending.codeVerifier, pending.redirectUri)
        val fresh = StoredSession.from(tokens, clock.now()) ?: return SignInError.Rejected

        // Member lookup runs through PostgREST, which asks accessToken() for
        // this very token — so it must be live before the query.
        session.value = fresh
        val member = try {
            memberLookup.memberFor(fresh.userId)
        } catch (e: Throwable) {
            session.value = null
            throw e
        }
        if (member == null) {
            session.value = null
            return SignInError.NoMember
        }
        // Whatever this device still caches belongs to whoever was signed in
        // before: a session lost without a sign-out (an unreadable or corrupt
        // store) never wiped it, and it may hold that member's private rows.
        // Reads are scoped by workspace only, so the partner signing in here
        // would see them. Still signed out, so widgets re-render as such.
        try {
            localData.clearAll()
        } catch (e: Throwable) {
            session.value = null
            throw e
        }
        val complete = fresh.copy(memberId = member.memberId, workspaceId = member.workspaceId)
        store.writeSession(complete)
        session.value = complete
        _authState.value = AuthState.SignedIn(complete.info()!!)
        return null
    }

    /** Runs under [refreshMutex]. */
    private suspend fun refresh(current: StoredSession): String? {
        val tokens = try {
            tokenClient.refresh(current.refreshToken)
        } catch (e: CancellationException) {
            throw e
        } catch (e: OAuthException) {
            if (e.isAuthFailure) {
                expire()
                return null
            }
            return current.accessToken.takeUnless { current.expiresWithin(Duration.ZERO, clock.now()) }
        } catch (e: Exception) {
            // Offline or a 5xx: keep the session, hand out the old token while it lasts.
            return current.accessToken.takeUnless { current.expiresWithin(Duration.ZERO, clock.now()) }
        }
        // Sign-out holds refreshMutex, so it can't interleave from here on; this
        // only guards a sign-in that replaced the session meanwhile.
        if (session.value?.refreshToken != current.refreshToken) return session.value?.accessToken
        val updated = current.refreshedWith(tokens, clock.now())
        persist(updated)
        session.value = updated
        return updated.accessToken
    }

    /**
     * Not under [stateMutex]: a refresh can run inside [completeSignIn] (its
     * member lookup asks for a token), which already holds it.
     */
    private suspend fun expire() {
        clearSession(SignOutReason.SessionExpired)
    }

    /**
     * The auth state flips before the cache is wiped: widgets re-rendered by
     * [LocalDataCleaner.clearAll] must already see "signed out" (a sign-in
     * prompt), not a signed-in member with empty tables ("nothing today").
     */
    private suspend fun clearSession(reason: SignOutReason) {
        session.value = null
        persist(null)
        try {
            store.writePending(null)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't clear the pending sign-in", e)
        }
        _authState.value = AuthState.SignedOut(reason)
        localData.clearAll()
    }

    /**
     * Stores [value], logging rather than throwing on failure: the rotated
     * tokens must reach [session] either way (the old refresh token is already
     * spent), and a crash here would take the whole process down. At worst the
     * next launch asks for a sign-in.
     */
    private suspend fun persist(value: StoredSession?) {
        try {
            store.writeSession(value)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't store the session", e)
        }
    }

    /**
     * Refreshes [REFRESH_LEEWAY] before expiry even when nothing is asking for
     * a token, so a live Realtime channel is re-authed in time. A transient
     * failure retries every [RETRY_DELAY]; a new token restarts the wait.
     */
    private suspend fun refreshAheadOfExpiry() {
        session.collectLatest { current ->
            if (current?.info() == null) return@collectLatest
            while (currentCoroutineContext().isActive) {
                val wait = current.expiresAt - REFRESH_LEEWAY - clock.now()
                if (wait.isPositive()) delay(wait)
                accessToken()
                delay(RETRY_DELAY)
            }
        }
    }

    private suspend fun runCatchingSignIn(block: suspend () -> SignInError?): SignInError? =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: OAuthException) {
            SignInError.Rejected
        } catch (e: Exception) {
            SignInError.Network
        }

    companion object {
        /** Refresh this long before the access token expires. */
        val REFRESH_LEEWAY: Duration = 60.seconds

        /** Authorization codes live 10 minutes; allow some time on the consent page on top. */
        val PENDING_TTL: Duration = 15.minutes

        val RETRY_DELAY: Duration = 30.seconds

        private const val TAG = "Planr"
    }
}

/** Thrown by data calls that need a signed-in member when there is none. */
class NotSignedInException : IllegalStateException("Not signed in.")

private fun constantTimeEquals(a: String?, b: String): Boolean =
    a != null && MessageDigest.isEqual(a.toByteArray(), b.toByteArray())
