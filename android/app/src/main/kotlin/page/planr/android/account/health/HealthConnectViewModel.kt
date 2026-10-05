package page.planr.android.account.health

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.health.HealthAvailability
import page.planr.android.core.data.health.HealthConnectSleepSource
import page.planr.android.core.data.health.HealthSleepSource
import page.planr.android.core.data.health.HealthSleepSync
import page.planr.android.core.data.health.HealthSyncProblem
import page.planr.android.core.data.health.HealthSyncResult

/** The Health Connect sheet's state. */
data class HealthConnectUi(
    val availability: HealthAvailability = HealthAvailability.Available,
    val connected: Boolean = false,
    val syncing: Boolean = false,
    val lastSyncAt: Instant? = null,
    val lastNights: Int? = null,
    val problem: HealthSyncProblem? = null,
    /** the member said no in Health Connect's permission screen */
    val denied: Boolean = false,
)

@HiltViewModel
class HealthConnectViewModel @Inject constructor(
    private val source: HealthSleepSource,
    private val sync: HealthSleepSync,
    @ApplicationScope private val appScope: CoroutineScope,
) : ViewModel() {
    private val availability = MutableStateFlow(source.availability())
    private val syncing = MutableStateFlow(false)
    private val denied = MutableStateFlow(false)

    val ui: StateFlow<HealthConnectUi> = combine(availability, sync.status, syncing, denied) { avail, status, busy, no ->
        HealthConnectUi(
            availability = avail,
            connected = status.connected,
            syncing = busy,
            lastSyncAt = status.lastSyncAt,
            lastNights = status.lastNights,
            problem = status.problem,
            denied = no,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HealthConnectUi(availability.value))

    /** What to ask Health Connect for. */
    fun permissions(): Set<String> = source.permissionsToRequest()

    /** Back from the Play Store, Health Connect may have been installed. */
    fun refresh() {
        availability.value = source.availability()
    }

    fun onPermissionsResult(granted: Set<String>) {
        if (HealthConnectSleepSource.READ_SLEEP !in granted) {
            denied.value = true
            return
        }
        denied.value = false
        launchSync { sync.connect() }
    }

    fun syncNow() = launchSync { sync.sync() }

    /** In the app scope: closing the sheet must not cancel the revoke. */
    fun disconnect() {
        appScope.launch { sync.disconnect() }
    }

    private fun launchSync(block: suspend () -> HealthSyncResult) {
        if (syncing.value) return
        syncing.value = true
        // The app scope, so a sync isn't cut short when the sheet closes.
        appScope.launch {
            try {
                block()
            } finally {
                syncing.value = false
            }
        }
    }
}
