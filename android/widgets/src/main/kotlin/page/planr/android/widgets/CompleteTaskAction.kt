package page.planr.android.widgets

import android.content.Context
import android.widget.Toast
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.ToggleableStateKey
import androidx.datastore.preferences.core.Preferences
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The Tasks widget's checkbox: completes the task the way the app's checkbox
 * does (`TaskRepository.setDone`: done board + `completed_at`), which writes
 * Supabase, then Room. The row shows ticked at once; it leaves the list when
 * the write lands, or unticks with a toast when it fails.
 *
 * The tick is persisted Glance state, so it is always cleared in a `finally`,
 * and it carries its start time: one orphaned by a killed process expires
 * after [WidgetState.PENDING_TTL_MS] instead of locking the row.
 */
class CompleteTaskAction : ActionCallback {

    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val taskId = parameters[TaskIdKey] ?: return
        val widget = TasksWidget()
        if (parameters[ToggleableStateKey] == false) {
            // Unticking a row that is still completing: the write is already on its way.
            // A tick that outlived its write (the process died) just re-renders without it.
            val live = WidgetState.pendingDone(widget.getAppWidgetState<Preferences>(context, glanceId))
            if (taskId !in live) {
                updateAppWidgetState(context, glanceId) { prefs ->
                    prefs[WidgetState.PendingDone] = WidgetState.withoutPending(prefs, taskId)
                }
                WidgetUpdates.refresh(context, widget, glanceId)
            }
            return
        }

        updateAppWidgetState(context, glanceId) { prefs ->
            prefs[WidgetState.PendingDone] = WidgetState.withPending(prefs, taskId)
        }
        widget.update(context, glanceId)

        var completed = false
        try {
            completed = complete(context, taskId)
        } finally {
            // Room already holds the outcome, so dropping the tick can't flash a stale row.
            withContext(NonCancellable) {
                updateAppWidgetState(context, glanceId) { prefs ->
                    prefs[WidgetState.PendingDone] = WidgetState.withoutPending(prefs, taskId)
                }
                WidgetUpdates.refresh(context, widget)
            }
        }
        if (!completed) {
            withContext(Dispatchers.Main) {
                Toast.makeText(context.applicationContext, R.string.widget_task_complete_failed, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** True when the task is now done (or already was, or is gone). */
    private suspend fun complete(context: Context, taskId: String): Boolean {
        val tasks = WidgetEntryPoint.from(context).taskRepository()
        return try {
            val task = tasks.getTask(taskId) ?: return true
            if (task.completedAt != null) return true
            // A widget broadcast can't run forever; a write that hangs counts as failed
            // (if it did land, Realtime or the next sync brings the row back in line).
            withTimeoutOrNull(WRITE_BUDGET) { tasks.setDone(task, done = true) } != null
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Offline, signed out, a concurrent edit (StaleWriteException reloads the
            // row), or no done column to move it to (TaskNotToggleableException).
            false
        }
    }

    companion object {
        val TaskIdKey = ActionParameters.Key<String>("planr.task_id")

        private val WRITE_BUDGET = 20.seconds
    }
}
