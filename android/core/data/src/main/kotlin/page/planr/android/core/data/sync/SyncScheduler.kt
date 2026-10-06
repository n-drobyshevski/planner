package page.planr.android.core.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.di.ApplicationScope

/**
 * Keeps [SyncWorker] scheduled while someone is signed in: a two-hourly
 * periodic sync (on a network, never on a low battery), plus one immediate
 * sync right after a fresh sign-in (a restored session is caught up by the
 * Realtime join instead); both are cancelled on sign-out.
 *
 * Two hours is enough for what the periodic sync serves: Realtime keeps the
 * cache live while the app is open, reminders are planned a day ahead
 * ([page.planr.android.core.data.reminders.ReminderPlanner.HORIZON]), and the
 * widgets turn the day over with their own midnight alarm.
 */
@Singleton
class SyncScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val session: SessionManager,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private var started = false
    private var wasSignedOut = false

    /** Call once from Application.onCreate. */
    fun start() {
        if (started) return
        started = true
        scope.launch {
            session.authState
                .map { state ->
                    when (state) {
                        is AuthState.SignedIn -> true
                        is AuthState.SignedOut, AuthState.Unconfigured -> false
                        AuthState.Loading -> null
                    }
                }
                .distinctUntilChanged()
                .collect { signedIn ->
                    when (signedIn) {
                        true -> schedule(syncNow = wasSignedOut)
                        false -> cancel()
                        null -> Unit
                    }
                    if (signedIn != null) wasSignedOut = !signedIn
                }
        }
    }

    /**
     * Runs a sync now (e.g. pull-to-refresh fallback, or right after sign-in),
     * even with the app on screen and Realtime joined ([KEY_REQUESTED]).
     */
    fun syncNow() {
        WorkManager.getInstance(context).enqueueUniqueWork(ONE_TIME, ExistingWorkPolicy.REPLACE, syncNowRequest())
    }

    private fun schedule(syncNow: Boolean) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC,
            // UPDATE, not KEEP: an install that scheduled the old 30-minute
            // request picks up the new period and constraints (its timing stays).
            ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<SyncWorker>(PERIOD_MINUTES, TimeUnit.MINUTES)
                .setConstraints(periodicConstraints())
                .build(),
        )
        if (syncNow) syncNow()
    }

    private fun cancel() {
        val work = WorkManager.getInstance(context)
        work.cancelUniqueWork(PERIODIC)
        work.cancelUniqueWork(ONE_TIME)
    }

    /** A sync nobody asked for waits for a network and a battery that isn't low. */
    private fun periodicConstraints() =
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

    internal companion object {
        /**
         * Input of a [syncNow] request: [SyncWorker] runs it even while the
         * app is on screen with Realtime joined, which only skips the periodic one.
         */
        const val KEY_REQUESTED = "requested"

        const val PERIODIC = "planr-sync-periodic"
        const val ONE_TIME = "planr-sync-now"
        const val PERIOD_MINUTES = 120L

        /** The one-time [syncNow] request: on a network, marked [KEY_REQUESTED]. */
        fun syncNowRequest(): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf(KEY_REQUESTED to true))
                .build()
    }
}
