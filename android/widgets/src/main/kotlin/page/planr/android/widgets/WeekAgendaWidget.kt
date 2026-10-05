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
import page.planr.android.core.model.CalendarVisibility
import page.planr.android.core.model.viewerTimeZone

/**
 * This week, Monday to Sunday, from the Room cache (the partner's personal
 * events only while the agenda's partner toggle is on): past days fold to one
 * line, today and the days ahead list their events. Tapping a day opens it in
 * the agenda; tapping an event opens the event.
 */
class WeekAgendaWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val loader = WeekAgendaLoader(WidgetEntryPoint.from(context))
        val initialTick = WidgetState.tick(getAppWidgetState<Preferences>(context, id))
        val initial = loader.load()
        DayRollover.sync(context)

        provideContent {
            val tick = WidgetState.tick(currentState<Preferences>())
            val content = rememberLoaded(initialTick, initial, tick) { loader.load() }
            WeekAgendaContent(content)
        }
    }
}

/**
 * Reads this week from Room in the viewer's zone (as [TodayAgendaLoader]);
 * never touches the network.
 */
internal class WeekAgendaLoader(private val entry: WidgetEntryPoint) {
    suspend fun load(): WidgetContent<WeekAgenda> = loadForSession(entry.sessionManager()) { session ->
        val members = entry.workspaceRepository().observeMembers().first()
        val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
        val today = entry.clock().todayIn(zone)
        val occurrences = CalendarVisibility.filter(
            occurrences = entry.occurrenceRepository().snapshot(WeekAgendaModel.weekWindow(today, zone), zone),
            viewerId = session.memberId,
            showPartner = entry.viewPreferences().showPartnerEvents.first(),
        )
        DayRollover.markRendered(today, zone)
        WeekAgendaModel.build(today, zone, occurrences, members)
    }
}

class WeekAgendaWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WeekAgendaWidget()

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
