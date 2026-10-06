package page.planr.android.widgets

import android.util.Log
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * A process-lifetime scope for widget work started outside Hilt (receivers,
 * component callbacks). A failure is logged like the app scope's, instead of
 * reaching the default handler and crashing the process.
 */
internal fun widgetScope(): CoroutineScope {
    val logFailures = CoroutineExceptionHandler { _, e -> Log.e(LOG_TAG, "Widget work failed", e) }
    return CoroutineScope(SupervisorJob() + Dispatchers.Default + logFailures)
}

private const val LOG_TAG = "Planr"
