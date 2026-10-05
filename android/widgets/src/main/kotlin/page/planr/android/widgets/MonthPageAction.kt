package page.planr.android.widgets

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

/** The Month widget's ‹ › (see [CalendarPaging]): [DeltaKey] months, 0 = back to this month. */
class MonthPageAction : ActionCallback {

    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val delta = parameters[DeltaKey] ?: return
        CalendarPaging.page(context, glanceId, MonthWidget(), WidgetState.MonthOffset, delta) { today, offset, zone ->
            MonthGridModel.gridWindow(MonthLoader.shownMonth(today, offset), zone)
        }
    }

    companion object {
        val DeltaKey = ActionParameters.Key<Int>("planr.month_delta")
    }
}
