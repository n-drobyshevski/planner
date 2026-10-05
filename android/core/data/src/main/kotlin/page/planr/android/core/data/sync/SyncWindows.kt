package page.planr.android.core.data.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.todayIn
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.TimeWindow

/** The calendar windows the background sync keeps fresh. */
object SyncWindows {
    private const val DAYS_AROUND_TODAY = 7

    /**
     * What the widgets can show: today ±7 days (Today, Week) and the weeks of
     * this month's grid (Month), from local midnight to local midnight.
     */
    fun aroundToday(clock: Clock = Clock.System, zone: TimeZone = TimeZone.currentSystemDefault()): TimeWindow {
        val today = clock.todayIn(zone)
        val grid = CalendarWeeks.monthGrid(today)
        val first = minOf(today.plus(DatePeriod(days = -DAYS_AROUND_TODAY)), grid.first().first())
        val last = maxOf(today.plus(DatePeriod(days = DAYS_AROUND_TODAY)), grid.last().last())
        return TimeWindow(first.atStartOfDayIn(zone), last.plus(DatePeriod(days = 1)).atStartOfDayIn(zone))
    }
}

/**
 * The window the agenda is showing, so a Realtime (re)connect can refetch
 * exactly what is on screen (as the web refetches its visible window).
 */
@Singleton
class VisibleWindowTracker @Inject constructor() {
    private val _window = MutableStateFlow<TimeWindow?>(null)
    val window: StateFlow<TimeWindow?> = _window.asStateFlow()

    fun show(window: TimeWindow) {
        _window.value = window
    }
}
