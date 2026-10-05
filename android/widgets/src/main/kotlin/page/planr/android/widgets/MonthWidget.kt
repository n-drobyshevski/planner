package page.planr.android.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.currentState
import kotlinx.coroutines.flow.first
import kotlinx.datetime.todayIn
import page.planr.android.core.model.viewerTimeZone

/**
 * This month as a Monday-first grid, from the Room cache: a dot per member
 * whose plans fall on a day (shared amber when joint), today marked. Tapping
 * a day opens it in the agenda; tapping the header opens the agenda.
 */
class MonthWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val loader = MonthLoader(WidgetEntryPoint.from(context))
        val initialTick = WidgetState.tick(getAppWidgetState<Preferences>(context, id))
        val initial = loader.load()
        DayRollover.sync(context)

        provideContent {
            val tick = WidgetState.tick(currentState<Preferences>())
            val content = rememberLoaded(initialTick, initial, tick) { loader.load() }
            MonthContent(content)
        }
    }
}

/**
 * Reads the month's grid from Room in the viewer's zone (as
 * [TodayAgendaLoader]); never touches the network.
 */
internal class MonthLoader(private val entry: WidgetEntryPoint) {
    suspend fun load(): WidgetContent<MonthGrid> = loadForSession(entry.sessionManager()) { session ->
        val members = entry.workspaceRepository().observeMembers().first()
        val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
        val today = entry.clock().todayIn(zone)
        val occurrences = entry.occurrenceRepository().snapshot(MonthGridModel.gridWindow(today, zone), zone)
        DayRollover.markRendered(today, zone)
        MonthGridModel.build(today, zone, occurrences, members)
    }
}

class MonthWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MonthWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetEntryPoint.from(context).syncScheduler().syncNow()
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        DayRollover.sync(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        DayRollover.sync(context)
    }
}
