package page.planr.android.widgets

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent

/** Today's occurrences for both members; tap opens the event. Placeholder until Phase 5. */
class TodayAgendaWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val title = context.getString(R.string.widget_today_name)
        provideContent {
            WidgetScaffold(title = title)
        }
    }
}

class TodayAgendaWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayAgendaWidget()
}
