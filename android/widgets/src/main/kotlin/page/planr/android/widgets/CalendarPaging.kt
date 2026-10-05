package page.planr.android.widgets

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.state.updateAppWidgetState
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.model.viewerTimeZone

/**
 * ‹ › for the grid widgets (Month, Week grid): moves one widget's period by a
 * delta (0 = back to the current one) and re-renders it from Room at once.
 * Background sync only keeps the current period, so for any other it then
 * fetches that period's events and re-renders again.
 */
internal object CalendarPaging {

    /** An action callback runs in a broadcast; keep well inside its window. */
    private val FETCH_BUDGET = 8.seconds

    /**
     * @param offsetKey where this widget keeps its period offset.
     * @param windowFor the window of the period [offset] periods from today's.
     */
    suspend fun page(
        context: Context,
        glanceId: GlanceId,
        widget: GlanceAppWidget,
        offsetKey: Preferences.Key<Int>,
        delta: Int,
        windowFor: (today: LocalDate, offset: Int, zone: TimeZone) -> TimeWindow,
    ) {
        var offset = 0
        updateAppWidgetState(context, glanceId) { prefs ->
            offset = if (delta == 0) 0 else (prefs[offsetKey] ?: 0) + delta
            prefs[offsetKey] = offset
        }
        widget.update(context, glanceId)
        if (offset == 0) return

        if (fetch(context) { today, zone -> windowFor(today, offset, zone) }) {
            WidgetUpdates.refresh(context, widget, glanceId)
        }
    }

    /** Pulls a window into Room; false when offline, signed out or too slow. */
    private suspend fun fetch(context: Context, window: (LocalDate, TimeZone) -> TimeWindow): Boolean {
        val entry = WidgetEntryPoint.from(context)
        return try {
            val session = entry.sessionManager().currentSession ?: return false
            val members = entry.workspaceRepository().observeMembers().first()
            val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
            withTimeoutOrNull(FETCH_BUDGET) {
                entry.occurrenceRepository().refresh(window(entry.clock().todayIn(zone), zone))
            } != null
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }
    }
}
