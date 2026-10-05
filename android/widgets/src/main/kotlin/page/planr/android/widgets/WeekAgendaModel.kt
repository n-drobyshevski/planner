package page.planr.android.widgets

import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/** This week, Monday to Sunday, as the Week widget draws it. */
internal data class WeekAgenda(val today: LocalDate, val days: List<WeekDay>) {
    val first: LocalDate get() = days.first().date
    val last: LocalDate get() = days.last().date
}

/** One day of the week and its rows (the Today widget's rows, for that day). */
internal data class WeekDay(val date: LocalDate, val rows: List<AgendaRow>)

/** Builds [WeekAgenda] from expanded occurrences. Pure, so it is unit-tested directly. */
internal object WeekAgendaModel {

    /** [today]'s Monday-first week, local midnight to local midnight. */
    fun weekWindow(today: LocalDate, zone: TimeZone): TimeWindow {
        val week = CalendarWeeks.weekOf(today)
        return TodayAgendaModel.daysWindow(week.first(), week.last(), zone)
    }

    /**
     * Each day of [today]'s week with its rows, bucketed and ordered exactly
     * as the Today widget does (an event spanning days shows on each).
     *
     * @param occurrences expanded over (at least) [weekWindow].
     * @param members the workspace's members, oldest first.
     */
    fun build(today: LocalDate, zone: TimeZone, occurrences: List<Occurrence>, members: List<Member>): WeekAgenda =
        WeekAgenda(
            today = today,
            days = CalendarWeeks.weekOf(today).map { day ->
                WeekDay(day, TodayAgendaModel.build(day, zone, occurrences, members).rows)
            },
        )
}
