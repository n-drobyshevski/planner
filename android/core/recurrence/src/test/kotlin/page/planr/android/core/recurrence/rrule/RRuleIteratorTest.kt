package page.planr.android.core.recurrence.rrule

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.time.Instant
import page.planr.android.core.recurrence.FixtureJson

/**
 * The rrule.js iterator port on rules the golden fixtures don't exercise.
 * Expected values are rrule.js 2.8.1 `between(after, before, true)` output.
 */
class RRuleIteratorTest {

    private fun between(rule: String, dtstart: String, after: String, before: String, limit: Int = 6): List<String> {
        val spec = RRuleSpec.from(RRuleOptions.parse(rule), ms(dtstart))
        return RRuleIterator(spec).between(ms(after), ms(before), inc = true)
            .take(limit)
            .map { FixtureJson.iso(Instant.fromEpochMilliseconds(it)) }
    }

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilliseconds()

    @Test
    fun `BYSETPOS picks the last weekday of each month`() {
        assertEquals(
            listOf(
                "2026-01-30T09:00:00.000Z", "2026-02-27T09:00:00.000Z",
                "2026-03-31T09:00:00.000Z", "2026-04-30T09:00:00.000Z", "2026-05-29T09:00:00.000Z",
            ),
            between(
                "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
                "2026-01-30T09:00:00Z", "2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z",
            ),
        )
    }

    @Test
    fun `nth weekdays in a monthly rule`() {
        assertEquals(
            listOf(
                "2026-01-05T09:00:00.000Z", "2026-01-26T09:00:00.000Z", "2026-02-02T09:00:00.000Z",
                "2026-02-23T09:00:00.000Z", "2026-03-02T09:00:00.000Z", "2026-03-30T09:00:00.000Z",
            ),
            between("FREQ=MONTHLY;BYDAY=+1MO,-1MO", "2026-01-01T09:00:00Z", "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z"),
        )
    }

    @Test
    fun `BYEASTER offsets from Easter Sunday`() {
        assertEquals(
            listOf("2026-04-03T10:00:00.000Z", "2027-03-26T10:00:00.000Z", "2028-04-14T10:00:00.000Z"),
            between("FREQ=YEARLY;BYEASTER=-2", "2026-01-01T10:00:00Z", "2026-01-01T00:00:00Z", "2029-01-01T00:00:00Z"),
        )
    }

    @Test
    fun `BYWEEKNO uses ISO-style week one`() {
        assertEquals(
            listOf("2027-01-04T08:00:00.000Z", "2028-01-03T08:00:00.000Z"),
            between("FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO", "2026-01-01T08:00:00Z", "2026-01-01T00:00:00Z", "2029-01-01T00:00:00Z"),
        )
    }

    @Test
    fun `WKST shifts which weeks an INTERVAL=2 rule lands on`() {
        assertEquals(
            listOf(
                "2026-03-15T07:00:00.000Z", "2026-03-16T07:00:00.000Z", "2026-03-29T07:00:00.000Z",
                "2026-03-30T07:00:00.000Z", "2026-04-12T07:00:00.000Z", "2026-04-13T07:00:00.000Z",
            ),
            between(
                "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU;WKST=SU",
                "2026-03-04T07:00:00Z", "2026-03-01T00:00:00Z", "2026-04-15T00:00:00Z",
            ),
        )
    }

    @Test
    fun `BYHOUR is emitted in the order given, not sorted (rrule js quirk)`() {
        assertEquals(
            listOf(
                "2026-03-02T18:00:00.000Z", "2026-03-02T09:00:00.000Z", "2026-03-03T18:00:00.000Z",
                "2026-03-03T09:00:00.000Z", "2026-03-04T18:00:00.000Z", "2026-03-04T09:00:00.000Z",
            ),
            between("FREQ=DAILY;BYHOUR=18,9", "2026-03-02T09:00:00Z", "2026-03-02T00:00:00Z", "2026-03-05T00:00:00Z"),
        )
    }

    @Test
    fun `sub-daily frequencies step through BYHOUR`() {
        assertEquals(
            listOf("2026-03-02T08:15:00.000Z", "2026-03-02T13:15:00.000Z", "2026-03-02T18:15:00.000Z"),
            between("FREQ=HOURLY;INTERVAL=5;BYHOUR=8,13,18", "2026-03-02T08:15:00Z", "2026-03-02T00:00:00Z", "2026-03-04T00:00:00Z"),
        )
    }

    @Test
    fun `COUNT counts from DTSTART, not from the window`() {
        assertEquals(
            listOf("2026-03-04T09:00:00.000Z", "2026-03-05T09:00:00.000Z"),
            between("FREQ=DAILY;COUNT=5", "2026-03-01T09:00:00Z", "2026-03-04T00:00:00Z", "2026-03-30T00:00:00Z"),
        )
    }

    @Test
    fun `UNTIL is inclusive`() {
        assertEquals(
            listOf("2026-03-01T09:00:00.000Z", "2026-03-02T09:00:00.000Z"),
            between("FREQ=DAILY;UNTIL=20260302T090000Z", "2026-03-01T09:00:00Z", "2026-03-01T00:00:00Z", "2026-03-30T00:00:00Z"),
        )
    }

    @Test
    fun `a rule without FREQ is rejected`() {
        assertFailsWith<IllegalArgumentException> { RRuleSpec.from(RRuleOptions.parse("BYDAY=MO"), 0L) }
    }
}
