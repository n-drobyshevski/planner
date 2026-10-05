package page.planr.android.core.recurrence

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant
import kotlinx.datetime.DayOfWeek

// Parity cases live in the golden fixtures; these cover the Kotlin-side shape.
class RRuleBuildTest {

    @Test
    fun `round-trips a weekly form`() {
        val form = RecurrenceForm(
            freq = Freq.WEEKLY,
            interval = 2,
            byWeekday = setOf(DayOfWeek.FRIDAY, DayOfWeek.MONDAY),
            end = RecurrenceEnd.Until(Instant.parse("2026-06-30T21:59:59Z")),
        )

        val rrule = RRuleBuild.buildRRule(form)

        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20260630T215959Z", rrule)
        assertEquals(form, RRuleBuild.parseRRule(rrule))
    }

    @Test
    fun `nth weekdays keep only their day`() {
        val form = RRuleBuild.parseRRule("FREQ=MONTHLY;BYDAY=-1FR")

        assertEquals(setOf(DayOfWeek.FRIDAY), form?.byWeekday)
    }

    @Test
    fun `an empty string is a rule, not an absent one`() {
        // parseRRule("") is a WEEKLY form on the web too (only null maps to null).
        assertEquals(RecurrenceForm(Freq.WEEKLY), RRuleBuild.parseRRule(""))
        assertNull(RRuleBuild.parseRRule(null))
    }
}
