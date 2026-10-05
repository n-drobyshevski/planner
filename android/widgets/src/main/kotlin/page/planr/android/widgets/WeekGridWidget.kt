package page.planr.android.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.currentState
import kotlinx.coroutines.flow.first
import kotlinx.datetime.todayIn
import page.planr.android.core.model.CalendarVisibility
import page.planr.android.core.model.viewerTimeZone

/**
 * A Monday-to-Sunday week as seven columns, from the Room cache (the
 * partner's personal events only while the agenda's partner toggle is on):
 * each day's events as titled chips in their agenda colours, today circled.
 * The header pages weeks (‹ ›, kept per widget) and adds an event (+).
 * Tapping a day opens it in the agenda. The list-style [WeekAgendaWidget]
 * (with start times) is a separate widget.
 */
class WeekGridWidget : GlanceAppWidget() {

    /** The content picks how many chips fit a column from the widget's actual size. */
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val loader = WeekGridLoader(WidgetEntryPoint.from(context))
        val prefs = getAppWidgetState<Preferences>(context, id)
        val initialKey = WidgetState.tick(prefs) to WidgetState.weekOffset(prefs)
        val initial = loader.load(initialKey.second)
        DayRollover.sync(context)

        provideContent {
            val state = currentState<Preferences>()
            val key = WidgetState.tick(state) to WidgetState.weekOffset(state)
            val content = rememberLoaded(initialKey, initial, key) { (_, offset) -> loader.load(offset) }
            WeekGridContent(content)
        }
    }
}

/**
 * Reads the week [offset] weeks from the current one from Room, in the
 * viewer's zone (as [TodayAgendaLoader]); never touches the network. Weeks
 * outside the synced window are fetched by [WeekPageAction].
 */
internal class WeekGridLoader(private val entry: WidgetEntryPoint) {
    suspend fun load(offset: Int): WidgetContent<WeekGrid> = loadForSession(entry.sessionManager()) { session ->
        val workspace = entry.workspaceRepository()
        val members = workspace.observeMembers().first()
        val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
        val today = entry.clock().todayIn(zone)
        val week = WeekGridModel.shownWeek(today, offset)
        val occurrences = CalendarVisibility.filter(
            occurrences = entry.occurrenceRepository().snapshot(WeekGridModel.weekWindow(week, zone), zone),
            viewerId = session.memberId,
            showPartner = entry.viewPreferences().showPartnerEvents.first(),
        )
        DayRollover.markRendered(today, zone)
        WeekGridModel.build(week, today, zone, occurrences, members, workspace.observeCategories().first())
    }
}

class WeekGridWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WeekGridWidget()

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
