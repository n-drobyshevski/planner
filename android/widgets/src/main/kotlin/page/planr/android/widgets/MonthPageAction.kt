package page.planr.android.widgets

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.state.updateAppWidgetState
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.todayIn
import page.planr.android.core.model.viewerTimeZone

/**
 * The Month widget's ‹ › (and its reset): moves this widget's month by
 * [DeltaKey] months (0 = back to the current month) and re-renders it from
 * Room at once. Background sync only keeps the current month's grid, so for
 * any other month it then fetches that grid's events and re-renders again.
 */
class MonthPageAction : ActionCallback {

    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val delta = parameters[DeltaKey] ?: return
        var offset = 0
        updateAppWidgetState(context, glanceId) { prefs ->
            offset = if (delta == 0) 0 else WidgetState.monthOffset(prefs) + delta
            prefs[WidgetState.MonthOffset] = offset
        }
        val widget = MonthWidget()
        widget.update(context, glanceId)
        if (offset == 0) return

        if (fetch(context, offset)) WidgetUpdates.refresh(context, widget, glanceId)
    }

    /** Pulls the shown grid into Room; false when offline, signed out or too slow. */
    private suspend fun fetch(context: Context, offset: Int): Boolean {
        val entry = WidgetEntryPoint.from(context)
        return try {
            val session = entry.sessionManager().currentSession ?: return false
            val members = entry.workspaceRepository().observeMembers().first()
            val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
            val month = MonthLoader.shownMonth(entry.clock().todayIn(zone), offset)
            withTimeoutOrNull(FETCH_BUDGET) {
                entry.occurrenceRepository().refresh(MonthGridModel.gridWindow(month, zone))
            } != null
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        val DeltaKey = ActionParameters.Key<Int>("planr.month_delta")

        /** An action callback runs in a broadcast; keep well inside its window. */
        private val FETCH_BUDGET = 8.seconds
    }
}
