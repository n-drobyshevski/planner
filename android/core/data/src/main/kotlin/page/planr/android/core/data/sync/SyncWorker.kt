package page.planr.android.core.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import io.github.jan.supabase.exceptions.RestException
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException
import page.planr.android.core.data.auth.NotSignedInException

/**
 * Periodic background refresh (every two hours on a network, see
 * [SyncScheduler]): the widgets' days ([SyncWindows.aroundToday]), tasks and
 * reference data into Room, then the widgets. Skipped while the app is on
 * screen with Realtime joined: the cache is live already. Built by the app's
 * HiltWorkerFactory (see PlanrApplication's WorkManager configuration).
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val runner: SyncRunner,
    private val realtime: RealtimeSync,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        val process = ProcessLifecycleOwner.get().lifecycle.currentStateFlow.value
        if (backgroundSyncNeeded(process, realtime.subscribed.value)) runner.syncAll()
        Result.success()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        when (syncFailureOutcome(e)) {
            SyncFailureOutcome.Retry -> Result.retry()
            SyncFailureOutcome.Done -> Result.success()
            SyncFailureOutcome.Fail -> Result.failure()
        }
    }
}

/**
 * Whether a background sync has anything to do: not while the app is in the
 * foreground ([process] at least STARTED) with Realtime [subscribed], since
 * every change is reaching the cache already (and the join refetched).
 */
internal fun backgroundSyncNeeded(process: Lifecycle.State, subscribed: Boolean): Boolean =
    !(process.isAtLeast(Lifecycle.State.STARTED) && subscribed)

/** What a failed background sync should do next. */
internal enum class SyncFailureOutcome {
    /** Transient: retry with WorkManager's backoff. */
    Retry,

    /** Nothing to sync (signed out meanwhile): done until the next period. */
    Done,

    /** Won't fix itself on retry: wait for the next period. */
    Fail,
}

/**
 * Classifies a sync failure. No network or a dropped connection (any
 * [IOException], which includes supabase-kt's `HttpRequestException` and
 * Ktor's request timeout) and a server answering 5xx, 408 or 429 are
 * transient. A sign-out mid-sync is not a failure. Other refusals (4xx,
 * RLS) and decoding errors fail until the next period.
 */
internal fun syncFailureOutcome(e: Exception): SyncFailureOutcome = when (e) {
    is NotSignedInException -> SyncFailureOutcome.Done
    is IOException -> SyncFailureOutcome.Retry
    is RestException -> if (isTransientStatus(e.statusCode)) SyncFailureOutcome.Retry else SyncFailureOutcome.Fail
    else -> SyncFailureOutcome.Fail
}

/** 5xx, 408 Request Timeout and 429 Too Many Requests are worth retrying. */
internal fun isTransientStatus(status: Int): Boolean = status in 500..599 || status == 408 || status == 429
