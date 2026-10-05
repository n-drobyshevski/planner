package page.planr.android.account

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SignOutReason
import page.planr.android.core.data.di.ApplicationScope

/** The account menu: sign out of this device. */
@HiltViewModel
class AccountViewModel @Inject constructor(
    private val session: SessionManager,
    @ApplicationScope private val appScope: CoroutineScope,
) : ViewModel() {

    /**
     * Runs in the application scope: signing out pops the screen hosting this
     * ViewModel, which would otherwise cancel the wipe halfway.
     */
    fun signOut() {
        appScope.launch { session.signOut(SignOutReason.UserRequested) }
    }
}
