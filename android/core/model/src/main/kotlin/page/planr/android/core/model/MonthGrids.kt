package page.planr.android.core.model

import java.time.temporal.IsoFields
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.toJavaLocalDate

/**
 * One day of a month grid with what it shows ([items], in drawing order).
 * Days of the neighbouring months that pad the first and last weeks are
 * not [inMonth].
 */
data class MonthCell<T>(
    val date: LocalDate,
    val inMonth: Boolean,
    val items: List<T>,
)

/**
 * The month grid both the agenda's Month view and the Month widget draw:
 * whole Monday-first weeks ([CalendarWeeks.monthGrid]) of cells, how many
 * chips a cell shows, and the window to load for it. What a cell's items
 * are is up to the caller, so each surface keeps its own chip.
 */
object MonthGrids {

    /** The grid of [month]'s month, local midnight of its first Monday to the midnight after its last Sunday. */
    fun gridWindow(month: LocalDate, zone: TimeZone): TimeWindow {
        val weeks = CalendarWeeks.monthGrid(month)
        return TimeWindow(
            weeks.first().first().atStartOfDayIn(zone),
            weeks.last().last().plus(1, DateTimeUnit.DAY).atStartOfDayIn(zone),
        )
    }

    /**
     * [month]'s whole weeks ([CalendarWeeks.monthGrid]), followed by the next
     * month's weeks until there are at least [minWeeks], so a grid that must
     * keep its height from month to month can always draw six rows.
     */
    fun weeks(month: LocalDate, minWeeks: Int = 0): List<List<LocalDate>> {
        val grid = CalendarWeeks.monthGrid(month)
        val extra = (minWeeks - grid.size).coerceAtLeast(0)
        val next = grid.last().last()
        return grid + List(extra) { week ->
            CalendarWeeks.weekOf(next.plus(week * CalendarWeeks.DAYS_PER_WEEK + 1, DateTimeUnit.DAY))
        }
    }

    /** Every day of [month]'s grid ([weeks]), week by week, with [itemsFor] that day. */
    fun <T> cells(month: LocalDate, minWeeks: Int = 0, itemsFor: (LocalDate) -> List<T>): List<List<MonthCell<T>>> {
        val first = CalendarWeeks.monthStart(month)
        return weeks(month, minWeeks).map { week ->
            week.map { day ->
                MonthCell(
                    date = day,
                    inMonth = day.month == first.month && day.year == first.year,
                    items = itemsFor(day),
                )
            }
        }
    }

    /** Whole months from [from]'s month to [to]'s; negative when [to] is earlier. */
    fun monthsBetween(from: LocalDate, to: LocalDate): Int =
        (to.year - from.year) * MONTHS_PER_YEAR + (to.month.ordinal - from.month.ordinal)

    /** ISO-8601 week number of [monday]'s week (weeks start Monday; week 1 holds the first Thursday). */
    fun isoWeek(monday: LocalDate): Int = monday.toJavaLocalDate().get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)

    /**
     * How a cell with room for [slots] chips shows [eventCount] events: the
     * chips to draw and the "+N" left over. When they don't all fit, the last
     * slot goes to "+N", so a cell never pretends to be complete.
     */
    fun chipLayout(slots: Int, eventCount: Int): Pair<Int, Int> = when {
        slots <= 0 -> 0 to 0
        eventCount <= slots -> eventCount to 0
        else -> (slots - 1) to (eventCount - (slots - 1))
    }

    private const val MONTHS_PER_YEAR = 12
}
