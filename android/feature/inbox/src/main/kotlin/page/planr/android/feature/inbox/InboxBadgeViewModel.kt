package page.planr.android.feature.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import page.planr.android.feature.inbox.data.InboxDataSource

/**
 * How many Inbox rows are waiting, for the account menu's quiet badge
 * (`useInboxCount`). Derived from the same data as the Inbox, so resolving
 * a row there lowers it here. The host calls [refresh] whenever it comes on
 * screen, which reads the requests and nights; events and tasks come from
 * Room as the rest of the app keeps it.
 */
@HiltViewModel
class InboxBadgeViewModel @Inject constructor(
    private val data: InboxDataSource,
    clock: Clock,
) : ViewModel() {

    val count: StateFlow<Int> = data.snapshots(minuteTicks(clock), data.nightWindowOrDefault())
        .map { it?.items?.size ?: 0 }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), 0)

    /** Rereads the requests and nights; failures keep the count. */
    fun refresh() {
        viewModelScope.launch { quietly { data.refreshRequests() } }
        viewModelScope.launch { quietly { data.refreshSleep() } }
    }

    private suspend fun quietly(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // keep the count
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
