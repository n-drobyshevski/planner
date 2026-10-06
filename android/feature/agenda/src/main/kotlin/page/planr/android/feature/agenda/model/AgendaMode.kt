package page.planr.android.feature.agenda.model

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.daysUntil
import kotlinx.datetime.plus
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.MonthGrids
import page.planr.android.core.model.TimeWindow

/**
 * The agenda's layouts. A period is one day, one Monday-first week (the
 * web's default), or one calendar month drawn as its whole weeks.
 */
enum class AgendaMode {
    Day,
    Week,
    Month,
}

/** Calendar math for agenda periods. Dates are in the viewer's zone. */
object AgendaPeriods {

    /** First day of the period containing [date] (for [AgendaMode.Month], the 1st). */
    fun periodStart(mode: AgendaMode, date: LocalDate): LocalDate = when (mode) {
        AgendaMode.Day -> date
        AgendaMode.Week -> CalendarWeeks.weekStart(date)
        AgendaMode.Month -> CalendarWeeks.monthStart(date)
    }

    /** The start of the period [offset] periods after the one containing [date]. */
    fun shiftedStart(mode: AgendaMode, date: LocalDate, offset: Int): LocalDate = when (mode) {
        AgendaMode.Day -> date.plus(offset, DateTimeUnit.DAY)
        AgendaMode.Week -> CalendarWeeks.weekStart(date).plus(offset * CalendarWeeks.DAYS_PER_WEEK, DateTimeUnit.DAY)
        AgendaMode.Month -> CalendarWeeks.monthStart(date).plus(offset, DateTimeUnit.MONTH)
    }

    /**
     * The days the period starting at [start] draws. A month draws its whole
     * weeks, padded to [MONTH_WEEKS], so it begins and ends with the
     * neighbouring months' days.
     */
    fun days(mode: AgendaMode, start: LocalDate): List<LocalDate> = when (mode) {
        AgendaMode.Day -> listOf(start)
        AgendaMode.Week -> CalendarWeeks.weekOf(start)
        AgendaMode.Month -> MonthGrids.weeks(start, MONTH_WEEKS).flatten()
    }

    /** How many periods [date]'s period is from [today]'s. */
    fun offsetOf(mode: AgendaMode, today: LocalDate, date: LocalDate): Int = when (mode) {
        AgendaMode.Day -> today.daysUntil(date)
        AgendaMode.Week -> Math.floorDiv(
            CalendarWeeks.weekStart(today).daysUntil(CalendarWeeks.weekStart(date)),
            CalendarWeeks.DAYS_PER_WEEK,
        )
        AgendaMode.Month -> MonthGrids.monthsBetween(today, date)
    }

    /**
     * What the agenda loads around the period starting at [start]: the days
     * of that period plus one on each side, so a swipe reveals a neighbour
     * that is already filled.
     */
    fun loadedDays(mode: AgendaMode, start: LocalDate): List<LocalDate> {
        val first = days(mode, shiftedStart(mode, start, -1)).first()
        val last = days(mode, shiftedStart(mode, start, 1)).last()
        return generateSequence(first) { it.plus(1, DateTimeUnit.DAY) }.takeWhile { it <= last }.toList()
    }

    /** Half-open window from the first loaded day's midnight to the day after the last. */
    fun windowOf(days: List<LocalDate>, zone: TimeZone): TimeWindow = TimeWindow(
        days.first().atStartOfDayIn(zone),
        days.last().plus(1, DateTimeUnit.DAY).atStartOfDayIn(zone),
    )

    /** Rows of the Month view: always six, so its height holds from month to month. */
    const val MONTH_WEEKS = 6
}
