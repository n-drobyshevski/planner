package page.planr.android.feature.agenda.model

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import org.junit.Test
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus

class MonthModelTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val october = LocalDate(2026, 10, 1)

    private fun block(
        key: String,
        start: String,
        end: String,
        allDay: Boolean = false,
        kind: EventKind = EventKind.Event,
        status: EventStatus = EventStatus.Confirmed,
    ) = AgendaBlock(
        key = key,
        eventId = key,
        title = key,
        start = Instant.parse(start),
        end = Instant.parse(end),
        allDay = allDay,
        color = "#c0492a",
        ownership = Ownership.Mine,
        status = status,
        inactive = false,
        kind = kind,
        isRecurring = false,
        isPrivate = false,
        categoryName = null,
        categoryColor = null,
    )

    /** The month as the agenda builds it: blocks bucketed into the grid's days, then cells. */
    private fun month(vararg blocks: AgendaBlock): List<List<MonthDayCell>> {
        val days = AgendaPeriods.days(AgendaMode.Month, october)
        val schedules = scheduleDays(blocks.toList(), days, berlin)
        return AgendaMonthModel.build(october) { schedules.getValue(it) }
    }

    private fun List<List<MonthDayCell>>.on(date: LocalDate): MonthDayCell = flatten().single { it.date == date }

    @Test
    fun `six weeks of cells, the neighbours' days marked as outside the month`() {
        val grid = month()
        assertEquals(6, grid.size)
        grid.forEach { assertEquals(7, it.size) }
        assertEquals(LocalDate(2026, 9, 28), grid.first().first().date)
        assertEquals(LocalDate(2026, 11, 8), grid.last().last().date)
        assertFalse(grid.on(LocalDate(2026, 9, 30)).inMonth)
        assertTrue(grid.on(LocalDate(2026, 10, 31)).inMonth)
        assertFalse(grid.on(LocalDate(2026, 11, 2)).inMonth)
    }

    @Test
    fun `a cell lists all-day events first, then timed ones by start`() {
        val grid = month(
            block("late", "2026-10-06T15:00:00Z", "2026-10-06T16:00:00Z"),
            block("early", "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z"),
            block("holiday", "2026-10-06T00:00:00Z", "2026-10-07T00:00:00Z", allDay = true),
            block("focus", "2026-10-06T08:00:00Z", "2026-10-06T12:00:00Z", kind = EventKind.Context),
            block("off", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z", status = EventStatus.Cancelled),
        )
        // Contexts are backdrops and cancelled ones are left out, as in the Month widget.
        assertEquals(listOf("holiday", "early", "late"), grid.on(LocalDate(2026, 10, 6)).items.map { it.key })
        // An all-day context window is still a backdrop, not a chip.
        val allDayContext = month(
            block("away", "2026-10-07T00:00:00Z", "2026-10-08T00:00:00Z", allDay = true, kind = EventKind.Context),
        )
        assertEquals(emptyList(), allDayContext.on(LocalDate(2026, 10, 7)).items)
        assertEquals(emptyList(), grid.on(LocalDate(2026, 10, 5)).items)
    }

    @Test
    fun `a cell shows up to three chips and gives the overflow a line of its own when there is room`() {
        // Room for three chips and "+N".
        assertEquals(3 to 0, AgendaMonthModel.chipLayout(rows = 4, eventCount = 3))
        assertEquals(3 to 1, AgendaMonthModel.chipLayout(rows = 4, eventCount = 4))
        assertEquals(3 to 4, AgendaMonthModel.chipLayout(rows = 4, eventCount = 7))
        // Room for three lines: all three chips, or two and "+N".
        assertEquals(3 to 0, AgendaMonthModel.chipLayout(rows = 3, eventCount = 3))
        assertEquals(2 to 2, AgendaMonthModel.chipLayout(rows = 3, eventCount = 4))
        // One line (large font): a lone event, else just "+N".
        assertEquals(1 to 0, AgendaMonthModel.chipLayout(rows = 1, eventCount = 1))
        assertEquals(0 to 2, AgendaMonthModel.chipLayout(rows = 1, eventCount = 2))
        assertEquals(0 to 0, AgendaMonthModel.chipLayout(rows = 4, eventCount = 0))
    }

    @Test
    fun `multi-day events have a chip on every day they cover`() {
        val grid = month(
            // Fri 30 Oct to Sun 1 Nov, all-day (end exclusive).
            block("trip", "2026-10-30T00:00:00Z", "2026-11-02T00:00:00Z", allDay = true),
            // Tue 13 Oct 22:00 to Thu 15 Oct 02:00 Berlin.
            block("night", "2026-10-13T20:00:00Z", "2026-10-15T00:00:00Z"),
            block("breakfast", "2026-10-14T05:00:00Z", "2026-10-14T06:00:00Z"),
        )
        val trip = grid.flatten().filter { cell -> cell.items.any { it.key == "trip" } }.map { it.date }
        assertEquals(listOf(LocalDate(2026, 10, 30), LocalDate(2026, 10, 31), LocalDate(2026, 11, 1)), trip)
        val night = grid.flatten().filter { cell -> cell.items.any { it.key == "night" } }.map { it.date }
        assertEquals(listOf(LocalDate(2026, 10, 13), LocalDate(2026, 10, 14), LocalDate(2026, 10, 15)), night)
        // Running on from the day before, it leads the day.
        assertEquals(listOf("night", "breakfast"), grid.on(LocalDate(2026, 10, 14)).items.map { it.key })
    }
}
