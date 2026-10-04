package page.planr.android.core.data.auth

/** Who is signed in: the auth user and the planner member/workspace it maps to. */
data class SessionInfo(
    val userId: String,
    val memberId: String,
    val workspaceId: String,
)

/** The app-wide auth state the navigation and sync layers react to. */
sealed interface AuthState {
    /** Restoring the stored session at startup. */
    data object Loading : AuthState

    /** Built without Supabase/OAuth config; sign-in cannot work. */
    data object Unconfigured : AuthState

    data class SignedOut(val reason: SignOutReason? = null) : AuthState

    data class SignedIn(val session: SessionInfo) : AuthState
}

enum class SignOutReason {
    UserRequested,

    /** The refresh token was rejected: the user must sign in again. */
    SessionExpired,
}

/** Progress of the Custom Tab sign-in, for the sign-in screen. */
sealed interface SignInProgress {
    data object Idle : SignInProgress

    /** Exchanging the code / resolving the member. */
    data object Completing : SignInProgress

    data class Failed(val error: SignInError) : SignInProgress
}

/** Why a sign-in attempt didn't complete. */
enum class SignInError {
    NotConfigured,

    /** A callback arrived but no sign-in was started (or it was already used). */
    NoPendingRequest,

    /** The started sign-in is older than the authorization code's lifetime. */
    Expired,

    /** `state` didn't match: possible CSRF, the callback is ignored. */
    StateMismatch,

    /** The user chose "Deny" on the consent page. */
    Denied,

    /** The OAuth server reported an error or refused the code. */
    Rejected,

    /** The account has no planner member (`members.auth_user_id`). */
    NoMember,

    /** Couldn't reach Supabase. */
    Network,
}
