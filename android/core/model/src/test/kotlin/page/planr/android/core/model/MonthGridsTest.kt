package page.planr.android.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone

class MonthGridsTest {

    @Test
    fun `cells pad the month with its neighbours' days and carry each day's items`() {
        val weeks = MonthGrids.cells(LocalDate(2026, 10, 17)) { day -> if (day.day == 6) listOf("dentist") else emptyList() }
        val cells = weeks.flatten()
        assertEquals(5, weeks.size)
        assertEquals(LocalDate(2026, 9, 28), cells.first().date)
        assertFalse(cells.first().inMonth)
        assertTrue(cells.single { it.date == LocalDate(2026, 10, 31) }.inMonth)
        assertFalse(cells.last().inMonth)
        // Only 6 October is in this grid (the padding runs 28 Sep to 1 Nov).
        assertEquals(listOf(LocalDate(2026, 10, 6)), cells.filter { it.items.isNotEmpty() }.map { it.date })
    }

    @Test
    fun `a grid can be padded to six weeks with the next month's`() {
        // February 2027 starts on a Monday and fills exactly four weeks.
        assertEquals(4, MonthGrids.weeks(LocalDate(2027, 2, 10)).size)
        val padded = MonthGrids.weeks(LocalDate(2027, 2, 10), minWeeks = 6)
        assertEquals(6, padded.size)
        assertEquals(LocalDate(2027, 3, 1), padded[4].first())
        assertEquals(LocalDate(2027, 3, 14), padded.last().last())
        // A six-week month (August 2026: Saturday the 1st) is left as is.
        assertEquals(6, MonthGrids.weeks(LocalDate(2026, 8, 1), minWeeks = 6).size)
        assertEquals(5, MonthGrids.cells(LocalDate(2026, 10, 1)) { emptyList<Unit>() }.size)
    }

    @Test
    fun `the window runs from the grid's first local midnight to the one after its last day`() {
        val window = MonthGrids.gridWindow(LocalDate(2026, 10, 17), TimeZone.of("Europe/Berlin"))
        assertEquals("2026-09-27T22:00:00Z", window.start.toString())
        assertEquals("2026-11-01T23:00:00Z", window.end.toString())
    }

    @Test
    fun `months between count calendar months, across years and backwards`() {
        assertEquals(0, MonthGrids.monthsBetween(LocalDate(2026, 10, 1), LocalDate(2026, 10, 31)))
        assertEquals(3, MonthGrids.monthsBetween(LocalDate(2026, 10, 31), LocalDate(2027, 1, 1)))
        assertEquals(-1, MonthGrids.monthsBetween(LocalDate(2026, 10, 1), LocalDate(2026, 9, 30)))
    }

    @Test
    fun `a full cell gives its last slot to the overflow`() {
        assertEquals(3 to 0, MonthGrids.chipLayout(slots = 3, eventCount = 3))
        assertEquals(2 to 3, MonthGrids.chipLayout(slots = 3, eventCount = 5))
        assertEquals(0 to 0, MonthGrids.chipLayout(slots = 0, eventCount = 4))
    }
}
