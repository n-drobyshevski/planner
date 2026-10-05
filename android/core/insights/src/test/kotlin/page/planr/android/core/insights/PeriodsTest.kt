package page.planr.android.core.insights

import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.period.Periods

/**
 * test/insights/period.test.ts, describe for describe (the URL codec and the
 * labels are not ported here). The fixtures cover the zone matrix; this keeps
 * the intent readable.
 */
class PeriodsTest {

    private val utc: ZoneId = ZoneOffset.UTC
    private val berlin: ZoneId = ZoneId.of("Europe/Berlin")

    /** `Date.UTC(y, mo, d, h, mi)` with a 0-based month, as in the TS test. */
    private fun utc(y: Int, mo: Int, d: Int, h: Int = 0, mi: Int = 0): Long =
        LocalDateTime.of(y, mo + 1, d, h, mi).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun state(
        preset: PeriodPreset = PeriodPreset.ThisWeek,
        granularity: Granularity = Granularity.Day,
        customFrom: Long? = null,
        customTo: Long? = null,
    ) = PeriodState(preset, customFrom, customTo, granularity)

    private val now = utc(2026, 5, 10, 12) // Wed 10 Jun 2026, 12:00 UTC

    @Test
    fun `the test JVM runs in a hostile default zone and locale`() {
        // build.gradle.kts sets these so a leak of the device zone or locale fails a test.
        assertEquals("Pacific/Chatham", ZoneId.systemDefault().id)
        assertEquals("ru", Locale.getDefault().language)
    }

    // --- resolvePeriod — calendar presets (UTC) ------------------------------------

    @Test
    fun `this-week spans Mon–Sun and compares to last week`() {
        val p = Periods.resolve(state(), utc, now)
        assertEquals(utc(2026, 5, 8), p.window.start)
        assertEquals(utc(2026, 5, 15), p.window.end)
        assertEquals(7, p.days.size)
        assertEquals(utc(2026, 5, 8), p.days[0])
        assertEquals(MsWindow(utc(2026, 5, 1), utc(2026, 5, 8)), p.prevWindow)
        assertEquals(7, p.prevDays.size)
        assertFalse(p.clamped)
    }

    @Test
    fun `last-week is the week before, comparing to the one before that`() {
        val p = Periods.resolve(state(PeriodPreset.LastWeek), utc, now)
        assertEquals(MsWindow(utc(2026, 5, 1), utc(2026, 5, 8)), p.window)
        assertEquals(MsWindow(utc(2026, 4, 25), utc(2026, 5, 1)), p.prevWindow)
    }

    @Test
    fun `this-month spans the calendar month and compares to the previous month`() {
        val p = Periods.resolve(state(PeriodPreset.ThisMonth), utc, now)
        assertEquals(MsWindow(utc(2026, 5, 1), utc(2026, 6, 1)), p.window)
        assertEquals(30, p.days.size)
        assertEquals(MsWindow(utc(2026, 4, 1), utc(2026, 5, 1)), p.prevWindow)
        assertEquals(31, p.prevDays.size)
    }

    @Test
    fun `last-7d rolls back 7 days from the end of today`() {
        val p = Periods.resolve(state(PeriodPreset.Last7d), utc, now)
        assertEquals(utc(2026, 5, 11), p.window.end)
        assertEquals(utc(2026, 5, 4), p.window.start)
        assertEquals(7, p.days.size)
        assertEquals(Granularity.Day, p.granularity)
        assertEquals(MsWindow(utc(2026, 4, 28), utc(2026, 5, 4)), p.prevWindow)
    }

    @Test
    fun `last-30d rolls back from the end of today and compares to the prior 30`() {
        val p = Periods.resolve(state(PeriodPreset.Last30d), utc, now)
        assertEquals(utc(2026, 5, 11), p.window.end)
        assertEquals(utc(2026, 4, 12), p.window.start)
        assertEquals(30, p.days.size)
        assertEquals(MsWindow(utc(2026, 3, 12), utc(2026, 4, 12)), p.prevWindow)
    }

    // --- resolvePeriod — custom ranges ---------------------------------------------

    @Test
    fun `treats from and to as inclusive days`() {
        val p = Periods.resolve(
            state(PeriodPreset.Custom, customFrom = utc(2026, 5, 1, 15), customTo = utc(2026, 5, 3, 9)),
            utc,
            now,
        )
        assertEquals(MsWindow(utc(2026, 5, 1), utc(2026, 5, 4)), p.window)
        assertEquals(3, p.days.size)
        assertEquals(MsWindow(utc(2026, 4, 29), utc(2026, 5, 1)), p.prevWindow)
    }

    @Test
    fun `swaps reversed bounds`() {
        val p = Periods.resolve(
            state(PeriodPreset.Custom, customFrom = utc(2026, 5, 3), customTo = utc(2026, 5, 1)),
            utc,
            now,
        )
        assertEquals(MsWindow(utc(2026, 5, 1), utc(2026, 5, 4)), p.window)
    }

    @Test
    fun `clamps over-long ranges to the most recent MAX_CUSTOM_DAYS days`() {
        val p = Periods.resolve(
            state(PeriodPreset.Custom, customFrom = utc(2024, 0, 1), customTo = utc(2026, 5, 1)),
            utc,
            now,
        )
        assertTrue(p.clamped)
        assertEquals(utc(2026, 5, 2), p.window.end)
        assertEquals(Periods.MAX_CUSTOM_DAYS, p.days.size)
    }

    @Test
    fun `falls back to this-week when the custom range is missing`() {
        val p = Periods.resolve(state(PeriodPreset.Custom), utc, now)
        assertEquals(MsWindow(utc(2026, 5, 8), utc(2026, 5, 15)), p.window)
        // The fallback keeps the requested granularity and uses this-week's default.
        val week = Periods.resolve(state(PeriodPreset.Custom, Granularity.Week, customFrom = now), utc, now)
        assertEquals(Granularity.Day, week.granularity)
    }

    // --- resolvePeriod — DST (Europe/Berlin) ---------------------------------------

    @Test
    fun `spring-forward week has a 23-hour day yet 7 day entries`() {
        val p = Periods.resolve(state(), berlin, utc(2026, 2, 25, 12))
        assertEquals(7, p.days.size)
        assertEquals(23 * HOUR, p.window.end - p.days[6])
        assertEquals(6 * DAY + 23 * HOUR, p.window.end - p.window.start)
        assertEquals(p.window.start, p.buckets.first().start)
        assertEquals(p.window.end, p.buckets.last().end)
    }

    @Test
    fun `month buckets across DST land on local month starts`() {
        val p = Periods.resolve(
            state(
                PeriodPreset.Custom,
                Granularity.Month,
                customFrom = utc(2026, 2, 1, 12),
                customTo = utc(2026, 4, 31, 12),
            ),
            berlin,
            now,
        )
        assertEquals(Granularity.Month, p.granularity)
        assertEquals(3, p.buckets.size)
        assertEquals(p.window.start, p.buckets[0].start)
        for (i in 1 until p.buckets.size) assertEquals(p.buckets[i - 1].end, p.buckets[i].start)
        assertEquals(p.window.end, p.buckets.last().end)
        assertEquals(31 * DAY - HOUR, p.buckets[0].end - p.buckets[0].start)
    }

    @Test
    fun `a day starting in a DST gap begins at its first valid instant`() {
        // America/Santiago springs forward AT midnight on 2026-09-06 (00:00 → 01:00).
        val santiago = ZoneId.of("America/Santiago")
        val p = Periods.resolve(state(), santiago, utc(2026, 8, 6, 15))
        assertEquals(utc(2026, 8, 6, 4), p.days.last()) // Sunday starts at 01:00 local
        assertEquals(23 * HOUR, p.window.end - p.days.last())
    }

    @Test
    fun `a rolling window anchored on that day keeps its 01_00 wall time, as date-fns does`() {
        // "Today" starts at 01:00, and date-fns' addDays keeps the wall time: the
        // web's last-7d window runs 01:00 to 01:00 and so touches 8 local days.
        val santiago = ZoneId.of("America/Santiago")
        val p = Periods.resolve(state(PeriodPreset.Last7d), santiago, utc(2026, 8, 6, 15))
        assertEquals(utc(2026, 8, 7, 4), p.window.end) // Mon 7 Sep 01:00 (−03)
        assertEquals(utc(2026, 7, 31, 5), p.window.start) // Mon 31 Aug 01:00 (−04)
        assertEquals(8, p.days.size)
    }

    // --- buckets — week granularity -----------------------------------------------------

    @Test
    fun `clips edge buckets to the window and aligns interior ones to Mondays`() {
        val p = Periods.resolve(
            state(PeriodPreset.Custom, Granularity.Week, customFrom = utc(2026, 4, 13), customTo = utc(2026, 5, 9)),
            utc,
            now,
        )
        assertEquals(Granularity.Week, p.granularity)
        assertEquals(MsWindow(utc(2026, 4, 13), utc(2026, 4, 18)), p.buckets[0])
        assertEquals(MsWindow(utc(2026, 4, 18), utc(2026, 4, 25)), p.buckets[1])
        assertEquals(p.window.end, p.buckets.last().end)
        for (i in 1 until p.buckets.size) assertEquals(p.buckets[i - 1].end, p.buckets[i].start)
    }

    // --- granularity rules -------------------------------------------------------------------

    private fun days(n: Int) = MsWindow(0, n * DAY)

    @Test
    fun `offers day up to 35 days, week from 14, month from 60`() {
        assertEquals(listOf(Granularity.Day), Periods.granularityChoices(days(7)))
        assertEquals(listOf(Granularity.Day, Granularity.Week), Periods.granularityChoices(days(14)))
        assertEquals(listOf(Granularity.Day, Granularity.Week), Periods.granularityChoices(days(30)))
        assertEquals(listOf(Granularity.Week, Granularity.Month), Periods.granularityChoices(days(90)))
        assertEquals(listOf(Granularity.Week, Granularity.Month), Periods.granularityChoices(days(366)))
    }

    @Test
    fun `falls back to the preset default when the requested one isn't allowed`() {
        val p = Periods.resolve(state(PeriodPreset.Last90d, Granularity.Day), utc, now)
        assertEquals(Granularity.Week, p.granularity)
    }

    @Test
    fun `defaults custom ranges by length`() {
        assertEquals(Granularity.Day, Periods.defaultGranularity(PeriodPreset.Custom, days(20)))
        assertEquals(Granularity.Week, Periods.defaultGranularity(PeriodPreset.Custom, days(120)))
        assertEquals(Granularity.Month, Periods.defaultGranularity(PeriodPreset.Custom, days(300)))
        assertEquals(Granularity.Day, Periods.defaultGranularity(PeriodPreset.ThisWeek, days(7)))
        assertEquals(Granularity.Week, Periods.defaultGranularity(PeriodPreset.Last90d, days(90)))
    }

    // --- Android additions -------------------------------------------------------------------

    @Test
    fun `the union window runs from the previous window's start to the window's end`() {
        val p = Periods.resolve(state(PeriodPreset.ThisMonth), berlin, now)
        assertEquals(MsWindow(p.prevWindow.start, p.window.end), Periods.unionWindow(p))
    }

    @Test
    fun `presets and granularities round-trip their TS ids`() {
        PeriodPreset.entries.forEach { assertEquals(it, PeriodPreset.fromId(it.id)) }
        Granularity.entries.forEach { assertEquals(it, Granularity.fromId(it.id)) }
        assertEquals(null, PeriodPreset.fromId("7d"))
    }

    private companion object {
        const val HOUR = 3_600_000L
        const val DAY = 24 * HOUR
    }
}
