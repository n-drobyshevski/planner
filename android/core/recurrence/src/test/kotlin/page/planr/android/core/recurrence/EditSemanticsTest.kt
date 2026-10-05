package page.planr.android.core.recurrence

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent

// The golden fixtures cover the main matrix; these pin the details around it.
class EditSemanticsTest {

    private val at = Instant.parse("2026-03-30T07:00:00Z")

    private fun series(rrule: String?) = PlannerEvent(
        id = "e1", workspaceId = "w", ownerId = "m", title = "Yoga", location = "Studio",
        start = Instant.parse("2026-03-03T06:00:00Z"), end = Instant.parse("2026-03-03T07:00:00Z"),
        timeZone = "Europe/Berlin", rrule = rrule,
        createdAt = Instant.parse("2026-01-01T00:00:00Z"), updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
    )

    @Test
    fun `cancelOccurrence keys a cancel override on the original start`() {
        val input = EditSemantics.cancelOccurrence("e1", at)

        assertEquals(OverrideType.Cancel, input.type)
        assertEquals(at, input.occurrenceDate)
        assertNull(input.patch)
    }

    @Test
    fun `modifyOccurrence carries the patch`() {
        val patch = OccurrencePatch(title = "Moved", location = PatchField.Value(null))

        val input = EditSemantics.modifyOccurrence("e1", at, patch)

        assertEquals(OverrideType.Modify, input.type)
        assertEquals(patch, input.patch)
    }

    @Test
    fun `editAll passes a cleared field through as a value`() {
        val result = EditSemantics.editAll(series("FREQ=DAILY"), OccurrencePatch(location = PatchField.Value(null)))

        assertEquals(OccurrencePatch(location = PatchField.Value(null)), result)
    }

    @Test
    fun `split keeps an existing UNTIL in its original position`() {
        val split = EditSemantics.splitThisAndFuture(
            series("FREQ=WEEKLY;UNTIL=20260601T000000Z;BYDAY=TU"),
            Instant.parse("2026-04-07T05:00:00Z"),
            OccurrencePatch(),
        )

        assertEquals("FREQ=WEEKLY;UNTIL=20260407T045959Z;BYDAY=TU", split.original.rrule)
        assertEquals("FREQ=WEEKLY;BYDAY=TU", split.newSeries.rrule)
    }

    @Test
    fun `split clears nullable fields only when the patch says so`() {
        val split = EditSemantics.splitThisAndFuture(
            series("FREQ=DAILY"),
            Instant.parse("2026-04-07T06:00:00Z"),
            OccurrencePatch(location = PatchField.Value(null)),
        )

        assertNull(split.newSeries.location)
        assertEquals("Yoga", split.newSeries.title)
        assertEquals(Instant.parse("2026-04-07T07:00:00Z"), split.newSeries.end)
    }

    @Test
    fun `capThisAndFuture swaps COUNT for UNTIL and keeps every other part`() {
        val cap = EditSemantics.capThisAndFuture(
            series("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=9"),
            Instant.parse("2026-04-02T05:00:00Z"),
        )
        assertEquals("FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260402T045959Z", cap.rrule)
        assertEquals(Instant.parse("2026-04-02T04:59:59Z"), cap.recurrenceEndsAt)

        // Rules the recurrence form can't express are no longer flattened to WEEKLY.
        val lastSundayInMarch = EditSemantics.capThisAndFuture(
            series("FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU"),
            Instant.parse("2028-03-26T07:00:00Z"),
        )
        assertEquals("FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU;UNTIL=20280326T065959Z", lastSundayInMarch.rrule)
    }
}
