package page.planr.android.widgets

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.datetime.DayOfWeek
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

class WeekGridModelTest {
    private val berlin = TimeZone.of("Europe/Berlin")

    // Wednesday 7 Oct 2026.
    private val today = LocalDate(2026, 10, 7)
    private val members = listOf(anna, boris)

    private fun build(vararg occurrences: Occurrence) =
        WeekGridModel.build(today, today, berlin, occurrences.toList(), members)

    @Test
    fun `a week is Monday to Sunday with its ISO number`() {
        val week = build()
        assertEquals(LocalDate(2026, 10, 5), week.start)
        assertEquals(LocalDate(2026, 10, 11), week.end)
        assertEquals(7, week.days.size)
        assertEquals(DayOfWeek.MONDAY, week.days.first().date.dayOfWeek)
        assertEquals(41, week.isoWeek)
    }

    @Test
    fun `the window is the week, local midnight to local midnight`() {
        val window = WeekGridModel.weekWindow(today, berlin)
        assertEquals("2026-10-04T22:00:00Z", window.start.toString())
        assertEquals("2026-10-11T22:00:00Z", window.end.toString())
    }

    @Test
    fun `columns list each day's events in agenda order and colour`() {
        val work = Category(id = "cat-work", workspaceId = WORKSPACE, ownerId = ANNA, name = "Work", color = "#0369a1")
        val week = WeekGridModel.build(
            weekStart = today,
            today = today,
            zone = berlin,
            occurrences = listOf(
                occurrence("late", "2026-10-07T15:00:00Z", "2026-10-07T16:00:00Z", owner = BORIS),
                occurrence("early", "2026-10-07T06:00:00Z", "2026-10-07T07:00:00Z").copy(categoryId = work.id),
                occurrence("off", "2026-10-07T09:00:00Z", "2026-10-07T10:00:00Z", status = EventStatus.Cancelled),
            ),
            members = members,
            categories = listOf(work),
        )
        val wednesday = week.days[2]
        assertEquals(listOf("early", "late"), wednesday.chips.map { it.key })
        assertEquals(listOf("#0369a1", "#0f766e"), wednesday.chips.map { it.colorHex })
        assertEquals(0, week.days[0].eventCount)
    }

    @Test
    fun `an event spanning days fills each of their columns`() {
        // Thu 20:00 to Sat 10:00 in Berlin.
        val week = build(occurrence("trip", "2026-10-08T18:00:00Z", "2026-10-10T08:00:00Z"))
        assertEquals(listOf(0, 0, 0, 1, 1, 1, 0), week.days.map { it.eventCount })
    }

    @Test
    fun `paging moves whole weeks across month and year boundaries`() {
        assertEquals(LocalDate(2026, 10, 5), WeekGridModel.shownWeek(today, 0))
        assertEquals(LocalDate(2026, 10, 26), WeekGridModel.shownWeek(today, 3))
        assertEquals(LocalDate(2026, 9, 28), WeekGridModel.shownWeek(today, -1))
        assertEquals(LocalDate(2027, 1, 4), WeekGridModel.shownWeek(today, 13))
        val january = WeekGridModel.build(LocalDate(2027, 1, 4), today, berlin, emptyList(), members)
        assertEquals(1, january.isoWeek)
        assertEquals(LocalDate(2027, 1, 10), january.end)
    }
}
