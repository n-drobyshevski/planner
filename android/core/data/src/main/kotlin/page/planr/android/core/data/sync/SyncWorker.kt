package page.planr.android.core.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

/**
 * Periodic background refresh (every 30 min on a network): the widgets' days
 * ([SyncWindows.aroundToday]), tasks and reference data into Room, then the
 * widgets. Built by the app's HiltWorkerFactory (see PlanrApplication's
 * WorkManager configuration).
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val runner: SyncRunner,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        runner.syncAll()
        Result.success()
    } catch (e: CancellationException) {
        throw e
    } catch (_: IOException) {
        Result.retry()
    } catch (_: Exception) {
        // Server-side refusals won't fix themselves on retry; wait for the next period.
        Result.failure()
    }
}
