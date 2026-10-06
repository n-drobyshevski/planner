package page.planr.android.feature.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atTime
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.feature.tasks.model.BlockSlots

class BlockSlotsTest {
    private val utc = TimeZone.UTC
    private val day = LocalDate(2026, 10, 6)

    /** Long before [day], so "now" never clips the window unless a test says so. */
    private val earlier = Instant.parse("2026-01-01T00:00:00Z")

    private fun at(time: String, date: LocalDate = day, zone: TimeZone = utc): Instant =
        date.atTime(LocalTime.parse(time)).toInstant(zone)

    private fun slot(
        vararg busy: Occurrence,
        duration: Duration = 30.minutes,
        now: Instant = earlier,
        date: LocalDate = day,
        zone: TimeZone = utc,
        member: String? = ANNA,
    ): Instant? = BlockSlots.nextFreeSlot(date, zone, duration, busy.toList(), member, now)

    @Test
    fun `an empty day starts at 08_00`() {
        assertEquals(at("08:00"), slot())
    }

    @Test
    fun `skips past an overlapping event`() {
        assertEquals(at("09:00"), slot(occurrence("a", at("08:00"), at("09:00"))))
    }

    @Test
    fun `a gap too short for the duration is skipped`() {
        val busy = arrayOf(
            occurrence("a", at("08:00"), at("09:00")),
            occurrence("b", at("09:15"), at("10:00")),
        )
        assertEquals(at("09:00"), slot(*busy, duration = 15.minutes))
        assertEquals(at("10:00"), slot(*busy, duration = 30.minutes))
    }

    @Test
    fun `an event ending off the grid rounds up to the next quarter hour`() {
        assertEquals(at("09:15"), slot(occurrence("a", at("08:00"), at("09:05"))))
    }

    @Test
    fun `back-to-back and nested events are cleared together`() {
        val busy = arrayOf(
            occurrence("long", at("08:00"), at("12:00")),
            occurrence("inside", at("09:00"), at("10:00")),
            occurrence("next", at("12:00"), at("12:45")),
        )
        assertEquals(at("12:45"), slot(*busy))
    }

    @Test
    fun `touching edges are not overlaps`() {
        // Half-open: a block may start as one event ends and end as the next begins.
        val busy = arrayOf(
            occurrence("a", at("08:00"), at("09:00")),
            occurrence("b", at("09:30"), at("10:00")),
        )
        assertEquals(at("09:00"), slot(*busy))
    }

    @Test
    fun `an event that started the night before still blocks the morning`() {
        assertEquals(at("09:30"), slot(occurrence("overnight", at("22:00", day.minusDays(1)), at("09:30"))))
    }

    @Test
    fun `all-day, cancelled and context items are ignored`() {
        val busy = arrayOf(
            occurrence("holiday", at("00:00"), at("00:00", day.plusDays(1)), allDay = true),
            occurrence("called-off", at("08:00"), at("10:00"), status = EventStatus.Cancelled),
            occurrence("backdrop", at("08:00"), at("18:00"), kind = EventKind.Context),
        )
        assertEquals(at("08:00"), slot(*busy))
    }

    @Test
    fun `the partner's personal events don't count, joint ones do`() {
        assertEquals(at("08:00"), slot(occurrence("theirs", at("08:00"), at("10:00"), owner = BORIS)))
        assertEquals(
            at("10:00"),
            slot(occurrence("ours", at("08:00"), at("10:00"), owner = BORIS, shared = true)),
        )
    }

    @Test
    fun `today starts from the next quarter hour after now`() {
        assertEquals(at("14:30"), slot(now = at("14:20")))
        assertEquals(at("14:15"), slot(now = at("14:15")))
        // Before the day window opens, the window wins.
        assertEquals(at("08:00"), slot(now = at("06:40")))
    }

    @Test
    fun `the block must end by 22_00`() {
        val busy = occurrence("evening", at("08:00"), at("21:30"))
        assertEquals(at("21:30"), slot(busy, duration = 30.minutes))
        assertNull(slot(busy, duration = 45.minutes))
        assertEquals(at("20:00"), slot(duration = 120.minutes, now = at("19:55")))
        assertNull(slot(duration = 120.minutes, now = at("20:01")))
    }

    @Test
    fun `a full day, or one already over, has no slot`() {
        assertNull(slot(occurrence("all", at("07:00"), at("23:00"))))
        assertNull(slot(now = at("22:30")))
        assertNull(slot(now = at("09:00", day.plusDays(1))))
    }

    @Test
    fun `the window follows the member's zone`() {
        val berlin = TimeZone.of("Europe/Berlin")
        // 08:00 in Berlin (CEST, +2) is 06:00 UTC.
        assertEquals(Instant.parse("2026-10-06T06:00:00Z"), slot(zone = berlin))
        val busy = occurrence("a", Instant.parse("2026-10-06T06:00:00Z"), Instant.parse("2026-10-06T07:10:00Z"))
        assertEquals(at("09:15", zone = berlin), slot(busy, zone = berlin))
    }

    @Test
    fun `spring forward keeps local quarter hours`() {
        val ny = TimeZone.of("America/New_York")
        val dst = LocalDate(2026, 3, 8) // 02:00 EST -> 03:00 EDT
        assertEquals(Instant.parse("2026-03-08T12:00:00Z"), slot(date = dst, zone = ny))
        val busy = occurrence("a", at("08:00", dst, ny), at("10:20", dst, ny))
        assertEquals(at("10:30", dst, ny), slot(busy, date = dst, zone = ny))
        // The window still ends at 22:00 local.
        assertEquals(at("21:00", dst, ny), slot(occurrence("b", at("08:00", dst, ny), at("21:00", dst, ny)), duration = 60.minutes, date = dst, zone = ny))
        assertNull(slot(occurrence("c", at("08:00", dst, ny), at("21:15", dst, ny)), duration = 60.minutes, date = dst, zone = ny))
    }

    @Test
    fun `fall back keeps local quarter hours`() {
        val ny = TimeZone.of("America/New_York")
        val dst = LocalDate(2026, 11, 1) // 02:00 EDT -> 01:00 EST
        assertEquals(Instant.parse("2026-11-01T13:00:00Z"), slot(date = dst, zone = ny))
        val busy = occurrence("a", at("08:00", dst, ny), at("13:05", dst, ny))
        assertEquals(at("13:15", dst, ny), slot(busy, date = dst, zone = ny))
    }

    @Test
    fun `a zero duration is rejected`() {
        assertFailsWith<IllegalArgumentException> { slot(duration = Duration.ZERO) }
    }

    @Test
    fun `default start falls back to the next full hour`() {
        val full = listOf(occurrence("all", at("07:00"), at("23:00")))
        assertEquals(LocalTime(15, 0), BlockSlots.defaultStart(day, utc, 30.minutes, full, ANNA, at("14:20")))
        assertEquals(LocalTime(15, 0), BlockSlots.defaultStart(day, utc, 30.minutes, full, ANNA, at("14:00")))
        assertEquals(LocalTime(0, 0), BlockSlots.defaultStart(day, utc, 30.minutes, emptyList(), ANNA, at("23:10")))
        assertEquals(LocalTime(9, 0), BlockSlots.defaultStart(day, utc, 30.minutes, listOf(occurrence("a", at("08:00"), at("09:00"))), ANNA, earlier))
    }

    @Test
    fun `default date is the due date only while it is ahead`() {
        val today = LocalDate(2026, 10, 6)
        assertEquals(today, BlockSlots.defaultDate(null, today))
        assertEquals(today, BlockSlots.defaultDate(LocalDate(2026, 10, 1), today))
        assertEquals(today, BlockSlots.defaultDate(today, today))
        assertEquals(LocalDate(2026, 10, 9), BlockSlots.defaultDate(LocalDate(2026, 10, 9), today))
    }

    @Test
    fun `day window spans the local day`() {
        val window = BlockSlots.dayWindow(LocalDate(2026, 3, 8), TimeZone.of("America/New_York"))
        assertEquals(Instant.parse("2026-03-08T05:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-03-09T04:00:00Z"), window.end) // a 23-hour day
    }

    private fun LocalDate.minusDays(n: Int) = plus(DatePeriod(days = -n))

    private fun LocalDate.plusDays(n: Int) = plus(DatePeriod(days = n))
}
