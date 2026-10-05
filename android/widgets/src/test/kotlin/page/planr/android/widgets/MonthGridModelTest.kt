package page.planr.android.widgets

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.widgets.WidgetFixtures.BORIS
import page.planr.android.widgets.WidgetFixtures.anna
import page.planr.android.widgets.WidgetFixtures.boris
import page.planr.android.widgets.WidgetFixtures.occurrence

class MonthGridModelTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val today = LocalDate(2026, 10, 17)
    private val members = listOf(anna, boris)

    private fun build(vararg occurrences: Occurrence) = MonthGridModel.build(today, berlin, occurrences.toList(), members)

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
    fun `one dot per member slot, A then B then shared`() {
        val grid = build(
            occurrence("joint", "2026-10-12T09:00:00Z", "2026-10-12T10:00:00Z", isShared = true),
            occurrence("boris", "2026-10-12T07:00:00Z", "2026-10-12T08:00:00Z", owner = BORIS),
            occurrence("anna-1", "2026-10-12T11:00:00Z", "2026-10-12T12:00:00Z"),
            occurrence("anna-2", "2026-10-12T13:00:00Z", "2026-10-12T14:00:00Z"),
        )
        val day = grid.day(LocalDate(2026, 10, 12))
        assertEquals(4, day.eventCount)
        assertEquals(
            listOf(MemberTone.Slot.MemberA, MemberTone.Slot.MemberB, MemberTone.Slot.Shared),
            day.tones.map { it.slot },
        )
        assertEquals("#c0492a", day.tones.first().hex)
    }

    @Test
    fun `cancelled occurrences leave no dot`() {
        val grid = build(occurrence("off", "2026-10-14T09:00:00Z", "2026-10-14T10:00:00Z", status = EventStatus.Cancelled))
        val day = grid.day(LocalDate(2026, 10, 14))
        assertEquals(0, day.eventCount)
        assertEquals(emptyList(), day.tones)
    }

    @Test
    fun `all-day and multi-day occurrences mark every day they cover`() {
        val grid = build(occurrence("holiday", "2026-10-30T00:00:00Z", "2026-11-02T00:00:00Z", allDay = true))
        val marked = grid.weeks.flatten().filter { it.eventCount > 0 }.map { it.date }
        assertEquals(listOf(LocalDate(2026, 10, 30), LocalDate(2026, 10, 31), LocalDate(2026, 11, 1)), marked)
    }
}
