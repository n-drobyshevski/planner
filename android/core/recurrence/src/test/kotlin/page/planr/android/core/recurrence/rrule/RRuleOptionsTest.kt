package page.planr.android.core.recurrence.rrule

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.time.Instant

/** `RRule.parseString` / `RRule.optionsToString` parity (expected strings are rrule.js output). */
class RRuleOptionsTest {

    private val until = Instant.parse("2026-04-01T04:59:59Z").toEpochMilliseconds()

    @Test
    fun `a rewritten rule keeps its parts in their original order`() {
        val options = RRuleOptions.parse("FREQ=WEEKLY;UNTIL=20260501T000000Z;BYDAY=TU;COUNT=4")
        options[RRuleOptions.Key.COUNT] = null
        options[RRuleOptions.Key.UNTIL] = until

        assertEquals("RRULE:FREQ=WEEKLY;UNTIL=20260401T045959Z;BYDAY=TU", options.toRuleString())
    }

    @Test
    fun `a new UNTIL is appended at the end`() {
        val options = RRuleOptions.parse("FREQ=WEEKLY;BYDAY=TU,TH")
        options[RRuleOptions.Key.COUNT] = null
        options[RRuleOptions.Key.UNTIL] = until

        assertEquals("RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260401T045959Z", options.toRuleString())
    }

    @Test
    fun `keys are case-insensitive and numbers and nth weekdays are normalized`() {
        assertEquals(
            "RRULE:FREQ=WEEKLY;BYDAY=+1TU;INTERVAL=2",
            RRuleOptions.parse("freq=weekly;byday=MO;interval=+2;BYDAY=1TU").toRuleString(),
        )
    }

    @Test
    fun `a TZID-bearing DTSTART line round-trips and drops the UNTIL Z`() {
        val options = RRuleOptions.parse("DTSTART;TZID=Europe/Berlin:20260301T090000\nRRULE:FREQ=DAILY;UNTIL=20260501T000000")
        options[RRuleOptions.Key.COUNT] = null
        options[RRuleOptions.Key.UNTIL] = until

        assertEquals(
            "DTSTART;TZID=Europe/Berlin:20260301T090000\nRRULE:FREQ=DAILY;UNTIL=20260401T045959",
            options.toRuleString(),
        )
    }

    @Test
    fun `an RRULE prefix and a date-only UNTIL parse`() {
        val options = RRuleOptions.parse("RRULE:FREQ=MONTHLY;UNTIL=20260501")

        assertEquals(Frequency.MONTHLY, options.freq)
        assertEquals(Instant.parse("2026-05-01T00:00:00Z").toEpochMilliseconds(), options.until)
    }

    @Test
    fun `an unknown FREQ parses to null, as undefined does in JS`() {
        assertNull(RRuleOptions.parse("FREQ=FORTNIGHTLY").freq)
    }

    @Test
    fun `malformed rules throw`() {
        assertFailsWith<IllegalArgumentException> { RRuleOptions.parse("FREQ=DAILY;FOO=1") }
        assertFailsWith<IllegalArgumentException> { RRuleOptions.parse("FREQ=DAILY;") }
        assertFailsWith<IllegalArgumentException> { RRuleOptions.parse("FREQ=WEEKLY;BYDAY=XX") }
        assertFailsWith<IllegalArgumentException> { RRuleOptions.parse("FREQ=DAILY;UNTIL=tomorrow") }
    }
}
