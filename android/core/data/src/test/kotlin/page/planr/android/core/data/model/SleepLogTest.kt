package page.planr.android.core.data.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone

/** The pure sleep rules the web keeps in lib/sleep/device-times.ts and log-fields.tsx. */
class SleepLogTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val oct5 = LocalDate(2026, 10, 5)

    private val device = SleepLog(
        date = oct5,
        bedtimeAt = Instant.parse("2026-10-04T21:40:30Z"),
        wokeAt = Instant.parse("2026-10-05T05:10:59Z"),
        timesSource = SleepTimesSource.HealthConnect,
    )

    @Test
    fun `a night is rated once it has a quality, a fatigue or a note`() {
        assertFalse(device.isRated)
        assertTrue(device.copy(quality = 1).isRated)
        assertTrue(device.copy(fatigue = 9).isRated)
        assertTrue(device.copy(note = "").isRated)
    }

    @Test
    fun `device times survive echoes but not real changes`() {
        val echo = SleepTimes(Instant.parse("2026-10-04T21:40:00Z"), Instant.parse("2026-10-05T05:10:00Z"))
        assertNull(keepDeviceTimes(echo, device))
        assertNull(keepDeviceTimes(SleepTimes(null, null), device))
        val moved = echo.copy(wokeAt = Instant.parse("2026-10-05T05:11:00Z"))
        assertEquals(moved, keepDeviceTimes(moved, device))
        // Half blank is a change, as on the web.
        val half = SleepTimes(echo.bedtimeAt, null)
        assertEquals(half, keepDeviceTimes(half, device))
    }

    @Test
    fun `typed and missing nights keep whatever the member sent`() {
        val times = SleepTimes(device.bedtimeAt, device.wokeAt)
        assertEquals(times, keepDeviceTimes(times, device.copy(timesSource = SleepTimesSource.Manual)))
        assertEquals(times, keepDeviceTimes(times, null))
        assertNull(keepDeviceTimes(null, null))
    }

    @Test
    fun `wall times resolve against the wake date`() {
        val evening = SleepTimes.fromWallClock(oct5, LocalTime(23, 40), LocalTime(7, 10), berlin)
        assertEquals(Instant.parse("2026-10-04T21:40:00Z"), evening.bedtimeAt)
        assertEquals(Instant.parse("2026-10-05T05:10:00Z"), evening.wokeAt)
        // Bed after midnight is on the wake date itself.
        val late = SleepTimes.fromWallClock(oct5, LocalTime(0, 30), LocalTime(8, 0), berlin)
        assertEquals(Instant.parse("2026-10-04T22:30:00Z"), late.bedtimeAt)
        // Noon is already "the evening before".
        assertEquals(
            Instant.parse("2026-10-04T10:00:00Z"),
            SleepTimes.fromWallClock(oct5, LocalTime(12, 0), null, berlin).bedtimeAt,
        )
        assertNull(SleepTimes.fromWallClock(oct5, null, null, berlin).wokeAt)
    }

    @Test
    fun `the sheet prefills the night's own times, else the latest night's, else 23 to 7`() {
        assertEquals(LocalTime(23, 40) to LocalTime(7, 10), SleepRatings.prefill(oct5, listOf(device), berlin))
        val oct6 = LocalDate(2026, 10, 6)
        assertEquals(LocalTime(23, 40) to LocalTime(7, 10), SleepRatings.prefill(oct6, listOf(device), berlin))
        assertEquals(LocalTime(23, 0) to LocalTime(7, 0), SleepRatings.prefill(oct6, emptyList(), berlin))
        // A later night's times never prefill an earlier one.
        assertEquals(LocalTime(23, 0) to LocalTime(7, 0), SleepRatings.prefill(LocalDate(2026, 10, 1), listOf(device), berlin))
    }

    @Test
    fun `untouched times are kept on a stored night and sent for a new one`() {
        val untouched = SleepRatings.rating(
            oct5, LocalTime(23, 0), LocalTime(7, 0), timesEdited = false,
            quality = 5, fatigue = null, note = "  ", zone = berlin,
        )
        assertNull(untouched.note)
        assertNull(untouched.timesFor(device))
        assertNull(untouched.timesFor(device.copy(timesSource = SleepTimesSource.Manual)))
        assertEquals(Instant.parse("2026-10-04T21:00:00Z"), untouched.timesFor(null)?.bedtimeAt)

        val edited = SleepRatings.rating(
            oct5, LocalTime(22, 0), LocalTime(7, 10), timesEdited = true,
            quality = 5, fatigue = null, note = " ok ", zone = berlin,
        )
        assertEquals("ok", edited.note)
        assertEquals(Instant.parse("2026-10-04T20:00:00Z"), edited.timesFor(device)?.bedtimeAt)
        // Edited back to the device's own minute: still an echo.
        val echo = edited.copy(times = SleepTimes.fromWallClock(oct5, LocalTime(23, 40), LocalTime(7, 10), berlin))
        assertNull(echo.timesFor(device))
    }

    @Test
    fun `a form opens on the night's own values and saves them back`() {
        val rated = device.copy(quality = 6, note = "slept well")
        val form = SleepRatingForm.open(oct5, listOf(rated), berlin)
        assertEquals(
            SleepRatingForm(oct5, LocalTime(23, 40), LocalTime(7, 10), quality = 6, note = "slept well", fromHealthConnect = true),
            form,
        )
        // Saved untouched, the device's times stay.
        val rating = form.copy(fatigue = 3).toRating(berlin)
        assertEquals(3, rating.fatigue)
        assertNull(rating.timesFor(rated))

        val next = SleepRatingForm.open(LocalDate(2026, 10, 6), listOf(rated), berlin)
        assertNull(next.quality)
        assertFalse(next.fromHealthConnect)
        assertEquals(LocalTime(23, 40), next.bedtime)
    }

    @Test
    fun `picked times must wake after the bedtime`() {
        fun rating(bed: LocalTime, wake: LocalTime, edited: Boolean = true) =
            SleepRatings.rating(oct5, bed, wake, edited, quality = null, fatigue = null, note = "", zone = berlin)

        assertTrue(rating(LocalTime(23, 40), LocalTime(7, 10)).timesInOrder)
        assertTrue(rating(LocalTime(0, 30), LocalTime(8, 0)).timesInOrder)
        // Morning bedtimes are on the wake date: 08:00 → 07:00 runs backwards.
        assertFalse(rating(LocalTime(8, 0), LocalTime(7, 0)).timesInOrder)
        assertFalse(rating(LocalTime(7, 0), LocalTime(7, 0)).timesInOrder)
        // Untouched prefilled times are never the member's mistake.
        assertTrue(rating(LocalTime(8, 0), LocalTime(7, 0), edited = false).timesInOrder)
    }
}
