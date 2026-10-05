package page.planr.android.widgets

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import page.planr.android.core.model.Occurrence
import page.planr.android.widgets.WidgetFixtures.anna
import page.planr.android.widgets.WidgetFixtures.boris
import page.planr.android.widgets.WidgetFixtures.occurrence

class WeekAgendaModelTest {
    private val berlin = TimeZone.of("Europe/Berlin")

    // Wednesday 7 Oct 2026.
    private val today = LocalDate(2026, 10, 7)
    private val members = listOf(anna, boris)

    private fun build(vararg occurrences: Occurrence) = WeekAgendaModel.build(today, berlin, occurrences.toList(), members)

    @Test
    fun `the window is the Monday-first week, local midnight to local midnight`() {
        val window = WeekAgendaModel.weekWindow(today, berlin)
        assertEquals("2026-10-04T22:00:00Z", window.start.toString())
        assertEquals("2026-10-11T22:00:00Z", window.end.toString())
    }

    @Test
    fun `seven days, Monday to Sunday, each with its own rows`() {
        val week = build(
            occurrence("mon", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z"),
            occurrence("wed-late", "2026-10-07T16:00:00Z", "2026-10-07T17:00:00Z"),
            occurrence("wed-early", "2026-10-07T06:00:00Z", "2026-10-07T07:00:00Z"),
            occurrence("next-mon", "2026-10-12T07:00:00Z", "2026-10-12T08:00:00Z"),
        )
        assertEquals(LocalDate(2026, 10, 5), week.first)
        assertEquals(LocalDate(2026, 10, 11), week.last)
        assertEquals(7, week.days.size)
        assertEquals(listOf("mon"), week.days[0].rows.map { it.key })
        assertEquals(listOf("wed-early", "wed-late"), week.days[2].rows.map { it.key })
        assertEquals(emptyList(), week.days[6].rows)
    }

    @Test
    fun `an event spanning days shows on each of them`() {
        // Thu 20:00 to Sat 10:00 in Berlin.
        val week = build(occurrence("trip", "2026-10-08T18:00:00Z", "2026-10-10T08:00:00Z"))
        assertEquals(listOf(0, 0, 0, 1, 1, 1, 0), week.days.map { it.rows.size })
        assertEquals(RowTime.AllDay, week.days[4].rows.single().time)
    }
}
