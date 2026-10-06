package page.planr.android.feature.agenda.model

import kotlinx.datetime.LocalDate
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.MonthCell
import page.planr.android.core.model.MonthGrids

/** A day of the Month view: its date, whether it is in the shown month, and its events as chips. */
typealias MonthDayCell = MonthCell<AgendaBlock>

/**
 * The Month view's grid, built from the same [DaySchedule]s the day and
 * week views draw, so a month shows exactly the events they do. Pure, so it
 * is unit-tested directly.
 */
object AgendaMonthModel {

    /** Chips a cell draws at most; past that, "+N" on a row of its own ([chipLayout]). */
    const val CHIP_SLOTS = 3

    /** Rows a cell can hold under its date: [CHIP_SLOTS] chips and the "+N" line. */
    const val CHIP_ROWS = CHIP_SLOTS + 1

    /**
     * Six weeks of cells for [month] (any day of it), each with its chips
     * ([chipsOf]) read from [schedule].
     */
    fun build(month: LocalDate, schedule: (LocalDate) -> DaySchedule): List<List<MonthDayCell>> =
        MonthGrids.cells(month, AgendaPeriods.MONTH_WEEKS) { date -> chipsOf(schedule(date)) }

    /**
     * A day's events in a cell's order: all-day first, then timed ones by
     * the minute they start on that day (so an event running on from the day
     * before leads), then title. A multi-day event has a chip on every day it
     * covers. Contexts are backdrops, not events (all-day ones included), and
     * cancelled occurrences are left out, as in the Month widget.
     */
    fun chipsOf(day: DaySchedule): List<AgendaBlock> {
        val timed = day.timed
            .sortedWith(compareBy({ it.startMinute }, { it.block.title }, { it.block.key }))
            .map { it.block }
        return (day.allDay + timed).filter { it.kind == EventKind.Event && it.status != EventStatus.Cancelled }
    }

    /**
     * How a cell with room for [rows] lines under its date shows [eventCount]
     * events: the chips to draw (never more than [CHIP_SLOTS]) and the "+N"
     * left over. "+N" takes a line of its own, as on the web's month grid, so
     * a roomy cell shows three chips and "+N"; a cramped one gives its last
     * line to "+N" rather than pretend to be complete.
     */
    fun chipLayout(rows: Int, eventCount: Int): Pair<Int, Int> {
        if (rows <= 0) return 0 to 0
        if (eventCount <= minOf(rows, CHIP_SLOTS)) return eventCount to 0
        val shown = minOf(rows - 1, CHIP_SLOTS)
        return shown to eventCount - shown
    }
}
