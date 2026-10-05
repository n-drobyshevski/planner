package page.planr.android.feature.quickadd

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import page.planr.android.feature.quickadd.model.QuickAddError
import page.planr.android.feature.quickadd.model.QuickAddForm

class QuickAddFormTest {
    private val berlin = TimeZone.of("Europe/Berlin")

    @Test
    fun `defaults start at the next half hour, one hour long, in the viewer's zone`() {
        val form = QuickAddForm.initial(QuickAddKind.Event, Instant.parse("2026-10-04T08:10:00Z"), berlin)
        assertEquals(LocalDate(2026, 10, 4), form.date)
        assertEquals(LocalTime(10, 30), form.startTime)
        assertEquals(LocalTime(11, 30), form.endTime)
        assertNull(form.dueDate)
    }

    @Test
    fun `a time already on the step is kept`() {
        val now = Instant.parse("2026-10-04T08:30:00Z")
        assertEquals(now, QuickAddForm.ceilToStep(now, 30))
    }

    @Test
    fun `late evening defaults run past midnight`() {
        val form = QuickAddForm.initial(QuickAddKind.Event, Instant.parse("2026-10-04T21:40:00Z"), berlin)
        assertEquals(LocalTime(0, 0), form.startTime)
        assertEquals(LocalDate(2026, 10, 5), form.date)

        val late = form.copy(date = LocalDate(2026, 10, 4), startTime = LocalTime(23, 30), endTime = LocalTime(0, 30))
        assertTrue(late.endsNextDay)
        assertEquals(
            Instant.parse("2026-10-04T21:30:00Z") to Instant.parse("2026-10-04T22:30:00Z"),
            late.eventTimes(berlin),
        )
    }

    @Test
    fun `timed events are wall-clock in the zone across a DST change`() {
        // Europe/Berlin leaves summer time on 2026-10-25 (03:00 CEST -> 02:00 CET).
        val form = QuickAddForm(
            kind = QuickAddKind.Event,
            date = LocalDate(2026, 10, 25),
            startTime = LocalTime(1, 0),
            endTime = LocalTime(4, 0),
        )
        assertEquals(
            Instant.parse("2026-10-24T23:00:00Z") to Instant.parse("2026-10-25T03:00:00Z"),
            form.eventTimes(berlin),
        )
    }

    @Test
    fun `all-day events are anchored to UTC midnight and end at the next one`() {
        val form = QuickAddForm(
            kind = QuickAddKind.Event,
            date = LocalDate(2026, 10, 4),
            startTime = LocalTime(9, 0),
            endTime = LocalTime(10, 0),
            allDay = true,
        )
        assertFalse(form.endsNextDay)
        assertEquals(
            Instant.parse("2026-10-04T00:00:00Z") to Instant.parse("2026-10-05T00:00:00Z"),
            form.eventTimes(berlin),
        )
    }

    @Test
    fun `moving the start keeps the duration`() {
        val form = QuickAddForm(QuickAddKind.Event, date = LocalDate(2026, 10, 4), startTime = LocalTime(9, 0), endTime = LocalTime(10, 30))
        val moved = form.withStartTime(LocalTime(23, 0))
        assertEquals(LocalTime(0, 30), moved.endTime)
        assertTrue(moved.endsNextDay)
    }

    @Test
    fun `validation wants a title and a non-empty timed event`() {
        val base = QuickAddForm(QuickAddKind.Event, date = LocalDate(2026, 10, 4), startTime = LocalTime(9, 0), endTime = LocalTime(9, 0))
        assertEquals(QuickAddError.TitleRequired, base.copy(title = "  ").validate())
        assertEquals(QuickAddError.EndBeforeStart, base.copy(title = "Gym").validate())
        assertNull(base.copy(title = "Gym", allDay = true).validate())
        assertNull(base.copy(kind = QuickAddKind.Task, title = "Gym").validate())
    }
}
