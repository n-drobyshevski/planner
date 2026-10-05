package page.planr.android.core.model

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.minus
import kotlinx.datetime.plus

/**
 * Monday-first calendar math (the web's default week), shared by the agenda,
 * the week and month widgets, and the background sync that keeps them filled.
 */
object CalendarWeeks {

    /** The Monday of [date]'s week. */
    fun weekStart(date: LocalDate): LocalDate = date.minus(date.dayOfWeek.isoDayNumber - 1, DateTimeUnit.DAY)

    /** [date]'s Monday-to-Sunday week. */
    fun weekOf(date: LocalDate): List<LocalDate> = daysFrom(weekStart(date), DAYS_PER_WEEK)

    /** The first day of [date]'s month. */
    fun monthStart(date: LocalDate): LocalDate = LocalDate(date.year, date.month, 1)

    /**
     * The whole weeks that cover [date]'s month, Monday to Sunday: four to six
     * rows of seven, padded with the neighbouring months' days.
     */
    fun monthGrid(date: LocalDate): List<List<LocalDate>> {
        val first = monthStart(date)
        val last = first.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY)
        val start = weekStart(first)
        val end = weekStart(last).plus(DAYS_PER_WEEK - 1, DateTimeUnit.DAY)
        val days = generateSequence(start) { it.plus(1, DateTimeUnit.DAY) }.takeWhile { it <= end }.toList()
        return days.chunked(DAYS_PER_WEEK)
    }

    private fun daysFrom(start: LocalDate, count: Int): List<LocalDate> =
        List(count) { start.plus(it, DateTimeUnit.DAY) }

    const val DAYS_PER_WEEK = 7
}
