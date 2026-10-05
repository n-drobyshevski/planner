package page.planr.android.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SignInError
import page.planr.android.core.data.auth.SignInProgress
import page.planr.android.core.data.auth.SignOutReason

/** What the sign-in screen shows. */
data class SignInUiState(
    val configured: Boolean = true,
    val completing: Boolean = false,
    val error: SignInError? = null,
    /** The last session ended because its refresh token was rejected. */
    val sessionExpired: Boolean = false,
    val signedIn: Boolean = false,
)

/**
 * Drives the Custom Tab sign-in. [signIn] emits the authorize URL on
 * [openBrowser]; the App Link callback is handed to SessionManager by
 * MainActivity, and its progress flows back here.
 */
@HiltViewModel
class SignInViewModel @Inject constructor(
    private val session: SessionManager,
) : ViewModel() {

    val state: StateFlow<SignInUiState> = combine(session.authState, session.signInProgress) { auth, progress ->
        SignInUiState(
            configured = auth != AuthState.Unconfigured,
            completing = progress == SignInProgress.Completing,
            error = (progress as? SignInProgress.Failed)?.error,
            sessionExpired = (auth as? AuthState.SignedOut)?.reason == SignOutReason.SessionExpired,
            signedIn = auth is AuthState.SignedIn,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SignInUiState())

    private val browserRequests = Channel<String>(Channel.BUFFERED)

    /** Authorize URLs to open in a Custom Tab, one per tap. */
    val openBrowser: Flow<String> = browserRequests.receiveAsFlow()

    fun signIn() {
        session.dismissSignInError()
        viewModelScope.launch { browserRequests.send(session.beginSignIn()) }
    }

    fun dismissError() = session.dismissSignInError()

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
