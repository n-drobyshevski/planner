package page.planr.android.widgets

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.widgets.WidgetFixtures.ANNA
import page.planr.android.widgets.WidgetFixtures.BORIS
import page.planr.android.widgets.WidgetFixtures.WORKSPACE
import page.planr.android.widgets.WidgetFixtures.anna
import page.planr.android.widgets.WidgetFixtures.boris
import page.planr.android.widgets.WidgetFixtures.occurrence

class MonthGridModelTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val today = LocalDate(2026, 10, 17)
    private val members = listOf(anna, boris)

    private fun build(vararg occurrences: Occurrence) = MonthGridModel.build(today, today, berlin, occurrences.toList(), members)

    private fun MonthGrid.day(date: LocalDate): MonthDay = weeks.flatten().single { it.date == date }

    @Test
    fun `the window covers the grid's whole weeks`() {
        val window = MonthGridModel.gridWindow(today, berlin)
        assertEquals("2026-09-27T22:00:00Z", window.start.toString())
        // Berlin is back on UTC+1 after 25 Oct.
        assertEquals("2026-11-01T23:00:00Z", window.end.toString())
    }

    @Test
    fun `days outside the month are padding`() {
        val grid = build()
        assertEquals(LocalDate(2026, 10, 1), grid.month)
        assertEquals(5, grid.weeks.size)
        assertFalse(grid.day(LocalDate(2026, 9, 30)).inMonth)
        assertTrue(grid.day(LocalDate(2026, 10, 1)).inMonth)
        assertFalse(grid.day(LocalDate(2026, 11, 1)).inMonth)
    }

    @Test
    fun `chips list the day's events in agenda order and colour`() {
        val work = Category(id = "cat-work", workspaceId = WORKSPACE, ownerId = ANNA, name = "Work", color = "#0369a1")
        val grid = MonthGridModel.build(
            month = today,
            today = today,
            zone = berlin,
            occurrences = listOf(
                occurrence("late", "2026-10-12T15:00:00Z", "2026-10-12T16:00:00Z", owner = BORIS),
                occurrence("early", "2026-10-12T07:00:00Z", "2026-10-12T08:00:00Z").copy(categoryId = work.id),
                occurrence("own", "2026-10-12T09:00:00Z", "2026-10-12T10:00:00Z").copy(color = "#7c3aed", categoryId = work.id),
                occurrence("holiday", "2026-10-12T00:00:00Z", "2026-10-13T00:00:00Z", allDay = true, isShared = true),
            ),
            members = members,
            categories = listOf(work),
        )
        val chips = grid.day(LocalDate(2026, 10, 12)).chips
        assertEquals(listOf("holiday", "early", "own", "late"), chips.map { it.key })
        // The item's own colour, else its context's, else its owner's.
        assertEquals(listOf("#c0492a", "#0369a1", "#7c3aed", "#0f766e"), chips.map { it.colorHex })
        assertEquals(MemberTone.Slot.Shared, chips.first().tone.slot)
    }

    @Test
    fun `cancelled occurrences get no chip`() {
        val grid = build(occurrence("off", "2026-10-14T09:00:00Z", "2026-10-14T10:00:00Z", status = EventStatus.Cancelled))
        val day = grid.day(LocalDate(2026, 10, 14))
        assertEquals(0, day.eventCount)
        assertEquals(emptyList(), day.chips)
    }

    @Test
    fun `weeks carry their ISO numbers`() {
        // October 2026: weeks 40 to 44, as a wall calendar shows them.
        assertEquals(listOf(40, 41, 42, 43, 44), build().weekNumbers)
        // Late December 2026 runs into ISO week 53; 4 Jan 2027 starts week 1.
        assertEquals(53, MonthGridModel.isoWeek(LocalDate(2026, 12, 28)))
        assertEquals(1, MonthGridModel.isoWeek(LocalDate(2027, 1, 4)))
    }

    @Test
    fun `another month can be shown, with today still marked`() {
        val november = MonthGridModel.build(LocalDate(2026, 11, 1), today, berlin, emptyList(), members)
        assertEquals(LocalDate(2026, 11, 1), november.month)
        assertEquals(today, november.today)
        assertEquals(LocalDate(2026, 10, 26), november.weeks.first().first().date)
        assertFalse(november.day(LocalDate(2026, 10, 31)).inMonth)
        assertTrue(november.day(LocalDate(2026, 11, 30)).inMonth)
        assertEquals(LocalDate(2027, 1, 1), MonthLoader.shownMonth(today, 3))
        assertEquals(LocalDate(2026, 9, 1), MonthLoader.shownMonth(today, -1))
    }

    @Test
    fun `a full cell gives its last slot to the overflow`() {
        assertEquals(2 to 0, MonthGridModel.chipLayout(slots = 3, eventCount = 2))
        assertEquals(3 to 0, MonthGridModel.chipLayout(slots = 3, eventCount = 3))
        assertEquals(2 to 3, MonthGridModel.chipLayout(slots = 3, eventCount = 5))
        assertEquals(0 to 4, MonthGridModel.chipLayout(slots = 1, eventCount = 4))
        assertEquals(0 to 0, MonthGridModel.chipLayout(slots = 0, eventCount = 4))
    }

    @Test
    fun `all-day and multi-day occurrences mark every day they cover`() {
        val grid = build(occurrence("holiday", "2026-10-30T00:00:00Z", "2026-11-02T00:00:00Z", allDay = true))
        val marked = grid.weeks.flatten().filter { it.eventCount > 0 }.map { it.date }
        assertEquals(listOf(LocalDate(2026, 10, 30), LocalDate(2026, 10, 31), LocalDate(2026, 11, 1)), marked)
    }
}
