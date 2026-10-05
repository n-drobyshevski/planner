package page.planr.android.widgets

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.widgets.WidgetFixtures.BORIS
import page.planr.android.widgets.WidgetFixtures.anna
import page.planr.android.widgets.WidgetFixtures.boris
import page.planr.android.widgets.WidgetFixtures.occurrence

class TodayAgendaModelTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val today = LocalDate(2026, 10, 5)
    private val members = listOf(anna, boris)

    private fun build(vararg occurrences: page.planr.android.core.model.Occurrence) =
        TodayAgendaModel.build(today, berlin, occurrences.toList(), members)

    @Test
    fun `the day window runs local midnight to local midnight`() {
        val window = TodayAgendaModel.dayWindow(today, berlin)
        assertEquals("2026-10-04T22:00:00Z", window.start.toString())
        assertEquals("2026-10-05T22:00:00Z", window.end.toString())
    }

    @Test
    fun `all-day rows come first, then timed rows by start`() {
        val agenda = build(
            occurrence("late", "2026-10-05T16:00:00Z", "2026-10-05T17:00:00Z"),
            occurrence("early", "2026-10-05T06:00:00Z", "2026-10-05T07:00:00Z"),
            occurrence("holiday", "2026-10-05T00:00:00Z", "2026-10-06T00:00:00Z", allDay = true),
        )
        assertEquals(listOf("holiday", "early", "late"), agenda.rows.map { it.key })
        assertEquals(RowTime.AllDay, agenda.rows[0].time)
        // 06:00Z is 08:00 in Berlin.
        assertEquals(RowTime.Starts(LocalTime(8, 0)), agenda.rows[1].time)
    }

    @Test
    fun `all-day occurrences belong to their UTC dates, not the local window`() {
        // Both overlap Berlin's Oct 5 window, but only the second is dated Oct 5.
        val agenda = build(
            occurrence("yesterday", "2026-10-04T00:00:00Z", "2026-10-05T00:00:00Z", allDay = true),
            occurrence("today", "2026-10-05T00:00:00Z", "2026-10-06T00:00:00Z", allDay = true),
        )
        assertEquals(listOf("today"), agenda.rows.map { it.key })
    }

    @Test
    fun `timed events from an earlier day read as until, or all day when they cover it`() {
        val agenda = build(
            occurrence("overnight", "2026-10-04T20:00:00Z", "2026-10-05T06:30:00Z"),
            occurrence("trip", "2026-10-03T08:00:00Z", "2026-10-07T08:00:00Z"),
        )
        val byKey = agenda.rows.associateBy { it.key }
        assertEquals(RowTime.Until(LocalTime(8, 30)), byKey.getValue("overnight").time)
        assertEquals(RowTime.AllDay, byKey.getValue("trip").time)
    }

    @Test
    fun `contexts are left out`() {
        val agenda = build(occurrence("work", "2026-10-05T07:00:00Z", "2026-10-05T15:00:00Z", kind = EventKind.Context))
        assertEquals(emptyList(), agenda.rows)
    }

    @Test
    fun `the bar is the owner's member colour, shared amber when joint`() {
        val agenda = build(
            occurrence("a", "2026-10-05T06:00:00Z", "2026-10-05T07:00:00Z"),
            occurrence("b", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z", owner = BORIS),
            occurrence("s", "2026-10-05T08:00:00Z", "2026-10-05T09:00:00Z", owner = BORIS, isShared = true),
            occurrence("x", "2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z", owner = "someone-else"),
        )
        assertEquals(
            listOf(
                MemberTone(MemberTone.Slot.MemberA, "#c0492a"),
                MemberTone(MemberTone.Slot.MemberB, "#0f766e"),
                MemberTone.Shared,
                MemberTone.Neutral,
            ),
            agenda.rows.map { it.tone },
        )
    }

    @Test
    fun `cancelled and inactive occurrences are flagged`() {
        val agenda = build(
            occurrence("c", "2026-10-05T06:00:00Z", "2026-10-05T07:00:00Z", status = EventStatus.Cancelled),
            occurrence("i", "2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z", inactive = true),
        )
        assertEquals(listOf(true to false, false to true), agenda.rows.map { it.cancelled to it.inactive })
    }
}
