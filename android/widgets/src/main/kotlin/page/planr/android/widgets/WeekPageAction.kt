package page.planr.android.widgets

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

/** The Week grid widget's ‹ › (see [CalendarPaging]): [DeltaKey] weeks, 0 = back to this week. */
class WeekPageAction : ActionCallback {

    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val delta = parameters[DeltaKey] ?: return
        CalendarPaging.page(context, glanceId, WeekGridWidget(), WidgetState.WeekOffset, delta) { today, offset, zone ->
            WeekGridModel.weekWindow(WeekGridModel.shownWeek(today, offset), zone)
        }
    }

    companion object {
        val DeltaKey = ActionParameters.Key<Int>("planr.week_delta")
    }
}
