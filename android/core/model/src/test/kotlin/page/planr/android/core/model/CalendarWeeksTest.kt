package page.planr.android.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate

class CalendarWeeksTest {

    @Test
    fun `weeks start on Monday`() {
        // Sunday 4 Oct 2026 belongs to the week of Monday 28 Sep.
        assertEquals(LocalDate(2026, 9, 28), CalendarWeeks.weekStart(LocalDate(2026, 10, 4)))
        assertEquals(LocalDate(2026, 10, 5), CalendarWeeks.weekStart(LocalDate(2026, 10, 5)))
        val week = CalendarWeeks.weekOf(LocalDate(2026, 10, 7))
        assertEquals(LocalDate(2026, 10, 5), week.first())
        assertEquals(LocalDate(2026, 10, 11), week.last())
    }

    @Test
    fun `the month grid is whole Monday-first weeks around the month`() {
        val october = CalendarWeeks.monthGrid(LocalDate(2026, 10, 17))
        // 1 Oct 2026 is a Thursday; 31 Oct a Saturday.
        assertEquals(5, october.size)
        assertEquals(LocalDate(2026, 9, 28), october.first().first())
        assertEquals(LocalDate(2026, 11, 1), october.last().last())
        october.forEach { week ->
            assertEquals(7, week.size)
            assertEquals(DayOfWeek.MONDAY, week.first().dayOfWeek)
        }
    }

    @Test
    fun `months span four to six weeks`() {
        // February 2027 starts on a Monday and has 28 days: exactly four weeks.
        assertEquals(4, CalendarWeeks.monthGrid(LocalDate(2027, 2, 1)).size)
        // August 2027 starts on a Sunday and has 31 days: six weeks.
        val august = CalendarWeeks.monthGrid(LocalDate(2027, 8, 31))
        assertEquals(6, august.size)
        assertEquals(LocalDate(2027, 7, 26), august.first().first())
        assertEquals(LocalDate(2027, 9, 5), august.last().last())
    }
}
