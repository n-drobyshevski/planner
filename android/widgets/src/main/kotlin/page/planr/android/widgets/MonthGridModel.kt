package page.planr.android.widgets

import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/** This month as the Month widget draws it: whole Monday-first weeks. */
internal data class MonthGrid(val month: LocalDate, val today: LocalDate, val weeks: List<List<MonthDay>>)

/**
 * One cell. [tones] says whose plans fall on the day: one dot per slot, in
 * [MemberTone.Slot] order, at most three.
 */
internal data class MonthDay(
    val date: LocalDate,
    val inMonth: Boolean,
    val eventCount: Int,
    val tones: List<MemberTone>,
)

/** Builds [MonthGrid] from expanded occurrences. Pure, so it is unit-tested directly. */
internal object MonthGridModel {

    /** The grid's weeks, local midnight of its first Monday to the midnight after its last Sunday. */
    fun gridWindow(today: LocalDate, zone: TimeZone): TimeWindow {
        val weeks = CalendarWeeks.monthGrid(today)
        return TodayAgendaModel.daysWindow(weeks.first().first(), weeks.last().last(), zone)
    }

    /**
     * Every day of [today]'s month grid with what's on it, bucketed as the
     * Today widget does. Cancelled occurrences don't count; inactive ones
     * still do (the Today widget lists them, muted).
     *
     * @param occurrences expanded over (at least) [gridWindow].
     * @param members the workspace's members, oldest first.
     */
    fun build(today: LocalDate, zone: TimeZone, occurrences: List<Occurrence>, members: List<Member>): MonthGrid {
        val month = CalendarWeeks.monthStart(today)
        val weeks = CalendarWeeks.monthGrid(today).map { week ->
            week.map { day ->
                val rows = TodayAgendaModel.build(day, zone, occurrences, members).rows.filterNot { it.cancelled }
                MonthDay(
                    date = day,
                    inMonth = day.month == month.month && day.year == month.year,
                    eventCount = rows.size,
                    tones = rows.map { it.tone }
                        .distinctBy { it.slot }
                        .sortedBy { it.slot.ordinal }
                        .take(MAX_DOTS),
                )
            }
        }
        return MonthGrid(month, today, weeks)
    }

    /** Member A, Member B, shared; an owner outside both slots (neutral) only fills a free place. */
    private const val MAX_DOTS = 3
}
