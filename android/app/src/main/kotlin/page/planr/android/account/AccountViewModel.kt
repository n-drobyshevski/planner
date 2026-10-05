package page.planr.android.account

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SignOutReason
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.feature.agenda.importics.IcsImportRequests
import page.planr.android.importics.IcsFileReader

/** The account menu: import an .ics file, sign out of this device. */
@HiltViewModel
class AccountViewModel @Inject constructor(
    private val session: SessionManager,
    @ApplicationScope private val appScope: CoroutineScope,
    private val icsFiles: IcsFileReader,
    private val icsRequests: IcsImportRequests,
) : ViewModel() {

    private val _importResults = Channel<IcsFileReader.Result>(Channel.BUFFERED)

    /** The outcome of each picked file; on [IcsFileReader.Result.Text] the review is ready to open. */
    val importResults: Flow<IcsFileReader.Result> = _importResults.receiveAsFlow()

    /**
     * Runs in the application scope: signing out pops the screen hosting this
     * ViewModel, which would otherwise cancel the wipe halfway.
     */
    fun signOut() {
        appScope.launch { session.signOut(SignOutReason.UserRequested) }
    }

    /** Reads the picked [uri] and, when it is readable, hands it to the import review. */
    fun importFile(uri: Uri) {
        viewModelScope.launch {
            val result = icsFiles.read(uri)
            if (result is IcsFileReader.Result.Text) icsRequests.offer(result.text)
            _importResults.send(result)
        }
    }
}
