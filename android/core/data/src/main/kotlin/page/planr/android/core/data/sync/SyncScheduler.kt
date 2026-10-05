package page.planr.android.core.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
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
 * Keeps [SyncWorker] scheduled while someone is signed in: a 30-minute
 * periodic sync, plus one immediate sync right after a fresh sign-in (a
 * restored session is caught up by the Realtime join instead); both are
 * cancelled on sign-out.
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

    /** Runs a sync now (e.g. pull-to-refresh fallback, or right after sign-in). */
    fun syncNow() {
        WorkManager.getInstance(context).enqueueUniqueWork(
            ONE_TIME,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(networkConstraint()).build(),
        )
    }

    private fun schedule(syncNow: Boolean) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(PERIOD_MINUTES, TimeUnit.MINUTES)
                .setConstraints(networkConstraint())
                .build(),
        )
        if (syncNow) syncNow()
    }

    private fun cancel() {
        val work = WorkManager.getInstance(context)
        work.cancelUniqueWork(PERIODIC)
        work.cancelUniqueWork(ONE_TIME)
    }

    private fun networkConstraint() =
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    private companion object {
        const val PERIODIC = "planr-sync-periodic"
        const val ONE_TIME = "planr-sync-now"
        const val PERIOD_MINUTES = 30L
    }
}
