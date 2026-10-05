package page.planr.android.feature.agenda.model

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.daysUntil
import kotlinx.datetime.plus
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.TimeWindow

/** The agenda's two layouts; a period is one day or one Monday-first week (the web's default). */
enum class AgendaMode(val days: Int) {
    Day(1),
    Week(7),
}

/** Calendar math for agenda periods. Dates are in the viewer's zone. */
object AgendaPeriods {

    /** First day of the period containing [date]. */
    fun periodStart(mode: AgendaMode, date: LocalDate): LocalDate = when (mode) {
        AgendaMode.Day -> date
        AgendaMode.Week -> CalendarWeeks.weekStart(date)
    }

    /** The start of the period [offset] periods after the one containing [date]. */
    fun shiftedStart(mode: AgendaMode, date: LocalDate, offset: Int): LocalDate =
        periodStart(mode, date).plus(offset * mode.days, DateTimeUnit.DAY)

    fun days(mode: AgendaMode, start: LocalDate): List<LocalDate> =
        List(mode.days) { start.plus(it, DateTimeUnit.DAY) }

    /** How many periods [date]'s period is from [today]'s. */
    fun offsetOf(mode: AgendaMode, today: LocalDate, date: LocalDate): Int =
        Math.floorDiv(periodStart(mode, today).daysUntil(periodStart(mode, date)), mode.days)

    /**
     * What the agenda loads around the period starting at [start]: that period
     * plus one on each side, so a swipe reveals a neighbour that is already filled.
     */
    fun loadedDays(mode: AgendaMode, start: LocalDate): List<LocalDate> =
        List(mode.days * 3) { start.plus(it - mode.days, DateTimeUnit.DAY) }

    /** Half-open window from the first loaded day's midnight to the day after the last. */
    fun windowOf(days: List<LocalDate>, zone: TimeZone): TimeWindow = TimeWindow(
        days.first().atStartOfDayIn(zone),
        days.last().plus(1, DateTimeUnit.DAY).atStartOfDayIn(zone),
    )
}
