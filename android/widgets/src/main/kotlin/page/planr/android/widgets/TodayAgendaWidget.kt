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
 * Today's occurrences from the Room cache (the partner's personal ones only
 * while the agenda's partner toggle is on): a colour bar for whose, the time,
 * the title. Tapping a row opens the event; tapping the header opens the
 * agenda.
 */
class TodayAgendaWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val loader = TodayAgendaLoader(WidgetEntryPoint.from(context))
        val initialTick = WidgetState.tick(getAppWidgetState<Preferences>(context, id))
        val initial = loader.load()
        DayRollover.sync(context)

        provideContent {
            val tick = WidgetState.tick(currentState<Preferences>())
            val content = rememberLoaded(initialTick, initial, tick) { loader.load() }
            TodayAgendaContent(content)
        }
    }
}

/**
 * Reads today from Room in the viewer's zone (their `members.timezone`, else
 * the device's — the same day and times as the app's agenda), showing the
 * partner's personal events only while the agenda's partner toggle is on;
 * never touches the network.
 */
internal class TodayAgendaLoader(private val entry: WidgetEntryPoint) {
    suspend fun load(): WidgetContent<TodayAgenda> = loadForSession(entry.sessionManager()) { session ->
        val members = entry.workspaceRepository().observeMembers().first()
        val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
        val today = entry.clock().todayIn(zone)
        val occurrences = CalendarVisibility.filter(
            occurrences = entry.occurrenceRepository().snapshot(TodayAgendaModel.dayWindow(today, zone), zone),
            viewerId = session.memberId,
            showPartner = entry.viewPreferences().showPartnerEvents.first(),
        )
        DayRollover.markRendered(today, zone)
        TodayAgendaModel.build(today, zone, occurrences, members)
    }
}

class TodayAgendaWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayAgendaWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        // The first widget on a home screen: pull the widgets' days so it fills.
        WidgetEntryPoint.from(context).syncScheduler().syncNow()
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        // Also runs after a reboot, which clears alarms.
        DayRollover.sync(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        DayRollover.sync(context)
    }
}
