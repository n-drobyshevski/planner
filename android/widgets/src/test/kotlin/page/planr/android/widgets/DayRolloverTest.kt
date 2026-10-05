package page.planr.android.widgets

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone

class DayRolloverTest {
    private val berlin = TimeZone.of("Europe/Berlin")

    @Test
    fun `next rollover is the next local midnight plus slack`() {
        val next = DayRollover.nextRollover(Instant.parse("2026-10-05T15:00:00Z"), berlin)
        assertEquals(Instant.parse("2026-10-05T22:00:02Z"), next)
    }

    @Test
    fun `right after midnight it waits for the following one`() {
        val next = DayRollover.nextRollover(Instant.parse("2026-10-05T22:00:01Z"), berlin)
        assertEquals(Instant.parse("2026-10-06T22:00:02Z"), next)
    }

    @Test
    fun `a DST change moves midnight's offset`() {
        // Berlin leaves summer time on 2026-10-25: Oct 26 starts at 23:00Z.
        val next = DayRollover.nextRollover(Instant.parse("2026-10-25T12:00:00Z"), berlin)
        assertEquals(Instant.parse("2026-10-25T23:00:02Z"), next)
    }

    @Test
    fun `stale only once a different day was rendered`() {
        val day = LocalDate(2026, 10, 5)
        DayRollover.markRendered(day, berlin)
        assertFalse(DayRollover.isStale(day))
        assertTrue(DayRollover.isStale(LocalDate(2026, 10, 6)))
        // Midnight is judged in the viewer's zone, not the device's.
        assertEquals(berlin, DayRollover.zone())
    }
}
