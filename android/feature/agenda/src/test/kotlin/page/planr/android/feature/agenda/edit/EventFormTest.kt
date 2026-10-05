package page.planr.android.feature.agenda.edit

import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import org.junit.Test
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.DefaultRecurrenceExpander
import page.planr.android.core.recurrence.Freq
import page.planr.android.core.recurrence.RecurrenceEnd
import page.planr.android.core.recurrence.RecurrenceForm
import page.planr.android.feature.agenda.Fixtures

class EventFormTest {
    private val berlin = TimeZone.of(Fixtures.ZONE)

    private fun occurrenceOf(event: PlannerEvent): Occurrence =
        DefaultRecurrenceExpander.expandEvent(event, emptyList(), TimeWindow(event.start - 1.days, event.end + 1.days)).first()

    @Test
    fun `timed times are read in the form zone`() {
        val form = EventForm.blank(Instant.parse("2026-10-04T07:30:00Z"), berlin)
        assertEquals(LocalTime(9, 30), form.startTime)
        assertEquals(LocalTime(10, 30), form.endTime)
        assertEquals(Instant.parse("2026-10-04T07:30:00Z"), form.start)
        assertEquals(Fixtures.ZONE, form.timeZone)
    }

    @Test
    fun `all-day dates are UTC midnights with an inclusive end date`() {
        val event = Fixtures.event(allDay = true, start = "2026-10-04T00:00:00Z", end = "2026-10-06T00:00:00Z")
        val form = EventForm.of(event, occurrenceOf(event), berlin)

        assertEquals(LocalDate(2026, 10, 4), form.startDate)
        assertEquals(LocalDate(2026, 10, 5), form.endDate)
        assertEquals(event.start, form.start)
        assertEquals(event.end, form.end)
    }

    @Test
    fun `moving the start keeps the duration`() {
        val form = EventForm.blank(Instant.parse("2026-10-04T07:00:00Z"), berlin)
            .copy(endTime = LocalTime(11, 0)) // 09:00 – 11:00

        val moved = form.withStart(time = LocalTime(23, 0))

        assertEquals(LocalDate(2026, 10, 5), moved.endDate)
        assertEquals(LocalTime(1, 0), moved.endTime)
    }

    @Test
    fun `validation needs a title and an end after the start`() {
        val form = EventForm.blank(Instant.parse("2026-10-04T07:00:00Z"), berlin)
        assertEquals(EventFormError.TitleRequired, form.validate())
        assertEquals(EventFormError.EndBeforeStart, form.copy(title = "x", endTime = LocalTime(8, 0)).validate())
        assertNull(form.copy(title = "x").validate())
    }

    @Test
    fun `the form reads the series rule and sharing`() {
        val event = Fixtures.event(rrule = "FREQ=WEEKLY;BYDAY=MO,WE", isShared = true)
        val form = EventForm.of(event, occurrenceOf(event), berlin)
        assertEquals(VisibilityChoice.Shared, form.visibility)
        assertEquals(Freq.WEEKLY, form.recurrence?.freq)
    }

    @Test
    fun `choosing weekly starts on the event's weekday`() {
        val form = withFrequency(null, Freq.WEEKLY, LocalDate(2026, 10, 4))
        assertEquals(setOf(kotlinx.datetime.DayOfWeek.SUNDAY), form?.byWeekday)
        assertEquals(RecurrenceEnd.Never, form?.end)
        assertNull(withFrequency(form, null, LocalDate(2026, 10, 4)))
        assertEquals(emptySet(), withFrequency(RecurrenceForm(Freq.WEEKLY, byWeekday = setOf(kotlinx.datetime.DayOfWeek.MONDAY)), Freq.MONTHLY, LocalDate(2026, 10, 4))?.byWeekday)
    }
}
