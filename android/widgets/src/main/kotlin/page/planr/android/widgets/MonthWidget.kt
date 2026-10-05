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
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlinx.datetime.todayIn
import page.planr.android.core.model.CalendarVisibility
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.viewerTimeZone

/**
 * A month as a Monday-first grid, from the Room cache (the partner's personal
 * events only while the agenda's partner toggle is on): ISO week numbers, the
 * day's events as titled chips in their agenda colours, today circled. The
 * header pages months (‹ ›, kept per widget) and adds an event (+). Tapping a
 * day opens it in the agenda.
 */
class MonthWidget : GlanceAppWidget() {

    /** The content picks how many chips fit a cell from the widget's actual size. */
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val loader = MonthLoader(WidgetEntryPoint.from(context))
        val prefs = getAppWidgetState<Preferences>(context, id)
        val initialKey = WidgetState.tick(prefs) to WidgetState.monthOffset(prefs)
        val initial = loader.load(initialKey.second)
        DayRollover.sync(context)

        provideContent {
            val state = currentState<Preferences>()
            val key = WidgetState.tick(state) to WidgetState.monthOffset(state)
            val content = rememberLoaded(initialKey, initial, key) { (_, offset) -> loader.load(offset) }
            MonthContent(content)
        }
    }
}

/**
 * Reads the grid of the month [offset] months from the current one from Room,
 * in the viewer's zone (as [TodayAgendaLoader]); never touches the network.
 * Months other than the current one are fetched by [MonthPageAction].
 */
internal class MonthLoader(private val entry: WidgetEntryPoint) {
    suspend fun load(offset: Int): WidgetContent<MonthGrid> = loadForSession(entry.sessionManager()) { session ->
        val workspace = entry.workspaceRepository()
        val members = workspace.observeMembers().first()
        val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
        val today = entry.clock().todayIn(zone)
        val month = shownMonth(today, offset)
        val occurrences = CalendarVisibility.filter(
            occurrences = entry.occurrenceRepository().snapshot(MonthGridModel.gridWindow(month, zone), zone),
            viewerId = session.memberId,
            showPartner = entry.viewPreferences().showPartnerEvents.first(),
        )
        DayRollover.markRendered(today, zone)
        MonthGridModel.build(month, today, zone, occurrences, members, workspace.observeCategories().first())
    }

    companion object {
        /** The first day of the month [offset] months from [today]'s. */
        fun shownMonth(today: LocalDate, offset: Int): LocalDate =
            CalendarWeeks.monthStart(today).plus(offset, DateTimeUnit.MONTH)
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
