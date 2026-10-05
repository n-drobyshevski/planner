package page.planr.android.widgets

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/** A Monday-to-Sunday week as the Week grid widget draws it: one column per day, its events as chips. */
internal data class WeekGrid(
    val start: LocalDate,
    val today: LocalDate,
    val isoWeek: Int,
    val days: List<MonthDay>,
) {
    val end: LocalDate get() = days.last().date
}

/** Builds [WeekGrid] from expanded occurrences. Pure, so it is unit-tested directly. */
internal object WeekGridModel {

    /** The Monday of the week [offset] weeks from [today]'s. */
    fun shownWeek(today: LocalDate, offset: Int): LocalDate =
        CalendarWeeks.weekStart(today).plus(offset * CalendarWeeks.DAYS_PER_WEEK, DateTimeUnit.DAY)

    /** [weekStart]'s week, local midnight of the Monday to the midnight after the Sunday. */
    fun weekWindow(weekStart: LocalDate, zone: TimeZone): TimeWindow {
        val week = CalendarWeeks.weekOf(weekStart)
        return TodayAgendaModel.daysWindow(week.first(), week.last(), zone)
    }

    /**
     * Every day of [weekStart]'s week with its events ([CalendarDays]).
     *
     * @param weekStart any day of the week to show.
     * @param occurrences expanded over (at least) [weekWindow].
     * @param members the workspace's members, oldest first.
     */
    fun build(
        weekStart: LocalDate,
        today: LocalDate,
        zone: TimeZone,
        occurrences: List<Occurrence>,
        members: List<Member>,
        categories: List<Category> = emptyList(),
    ): WeekGrid {
        val days = CalendarDays(zone, occurrences, members, categories)
        val week = CalendarWeeks.weekOf(weekStart)
        return WeekGrid(
            start = week.first(),
            today = today,
            isoWeek = MonthGridModel.isoWeek(week.first()),
            days = week.map { day -> MonthDay(date = day, inMonth = true, chips = days.chipsFor(day)) },
        )
    }
}
