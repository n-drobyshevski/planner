package page.planr.android.core.insights.period

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.datetime.toJavaLocalDate
import kotlinx.datetime.toKotlinLocalDate
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.model.CalendarWeeks

/**
 * The period model of lib/insights/period.ts: a preset or custom range
 * resolved to a half-open window with its local days, its bucket grid and the
 * comparison window before it. Boundaries are local midnights in an explicit
 * zone (DST-correct through java.time; see the date-fns note below for a day
 * that starts in a gap); weeks start on Monday.
 *
 * Previous-period semantics: calendar presets compare to the previous calendar
 * unit (this week → last week, this month → last month); rolling presets and
 * custom ranges to the immediately preceding window of equal day count.
 */
object Periods {

    /** Longest custom range aggregated over (period.ts `MAX_CUSTOM_DAYS`). */
    const val MAX_CUSTOM_DAYS = 366

    fun resolve(state: PeriodState, zone: ZoneId, now: Long): ResolvedPeriod {
        val today = startOfDayZoned(now, zone)
        val start: ZonedDateTime
        val end: ZonedDateTime
        val prevStart: ZonedDateTime
        var clamped = false
        when (state.preset) {
            PeriodPreset.ThisWeek -> {
                start = weekStart(today)
                end = start.plusDays(7)
                prevStart = start.minusWeeks(1)
            }
            PeriodPreset.LastWeek -> {
                end = weekStart(today)
                start = end.minusWeeks(1)
                prevStart = start.minusWeeks(1)
            }
            PeriodPreset.ThisMonth -> {
                start = monthStart(today)
                end = start.plusMonths(1)
                prevStart = start.minusMonths(1)
            }
            PeriodPreset.Last7d, PeriodPreset.Last30d, PeriodPreset.Last90d -> {
                val count = when (state.preset) {
                    PeriodPreset.Last7d -> 7L
                    PeriodPreset.Last30d -> 30L
                    else -> 90L
                }
                // Rolling window ending today (inclusive).
                end = today.plusDays(1)
                start = end.minusDays(count)
                prevStart = start.minusDays(count)
            }
            PeriodPreset.Custom -> {
                val from = state.customFrom
                val to = state.customTo
                // Missing bounds fall back to this week; the requested granularity
                // stays, and so does the this-week default (the web recurses with
                // `{ ...state, preset: "this-week" }`).
                if (from == null || to == null) return resolve(state.copy(preset = PeriodPreset.ThisWeek), zone, now)
                var fromDay = startOfDayZoned(from, zone)
                var toDay = startOfDayZoned(to, zone)
                if (fromDay.isAfter(toDay)) fromDay = toDay.also { toDay = fromDay }
                end = toDay.plusDays(1)
                var first = fromDay
                if (JsMath.dayCount(MsWindow(first.ms, end.ms)) > MAX_CUSTOM_DAYS) {
                    // Clamp over-long ranges to the most recent MAX_CUSTOM_DAYS days.
                    first = end.minusDays(MAX_CUSTOM_DAYS.toLong())
                    clamped = true
                }
                start = first
                prevStart = start.minusDays(JsMath.dayCount(MsWindow(start.ms, end.ms)).toLong())
            }
        }

        val window = MsWindow(start.ms, end.ms)
        val prevWindow = MsWindow(prevStart.ms, start.ms)
        val days = listDays(window.start, window.end, zone)
        val allowed = granularityChoices(window)
        val granularity =
            if (state.granularity in allowed) state.granularity else defaultGranularity(state.preset, window)
        return ResolvedPeriod(
            window = window,
            days = days,
            buckets = listBuckets(window, days, granularity, zone),
            granularity = granularity,
            prevWindow = prevWindow,
            prevDays = listDays(prevWindow.start, prevWindow.end, zone),
            clamped = clamped,
        )
    }

    /** Allowed granularities for a window length: day ≤ 35 days, week ≥ 14, month ≥ 60. */
    fun granularityChoices(window: MsWindow): List<Granularity> {
        val days = JsMath.dayCount(window)
        return buildList {
            if (days <= 35) add(Granularity.Day)
            if (days >= 14) add(Granularity.Week)
            if (days >= 60) add(Granularity.Month)
        }
    }

    /** The granularity a preset / window falls back to when the requested one isn't allowed. */
    fun defaultGranularity(preset: PeriodPreset, window: MsWindow): Granularity {
        if (preset == PeriodPreset.Last90d) return Granularity.Week
        if (preset != PeriodPreset.Custom) return Granularity.Day
        val days = JsMath.dayCount(window)
        return when {
            days <= 35 -> Granularity.Day
            days <= 182 -> Granularity.Week
            else -> Granularity.Month
        }
    }

    /** The local midnight of each day of `[start, end)`; a 23 h or 25 h DST day is one entry. */
    fun listDays(start: Long, end: Long, zone: ZoneId): List<Long> {
        val days = ArrayList<Long>()
        var day = localDate(start, zone)
        var cursor = midnight(day, zone)
        while (cursor < end) {
            days += cursor
            day = day.plusDays(1)
            cursor = midnight(day, zone)
        }
        return days
    }

    /**
     * Buckets tiling [window] at [granularity]. Day buckets are the [days];
     * week / month buckets run to the next Monday / first of the month, the
     * first and last clipped to the window.
     */
    fun listBuckets(window: MsWindow, days: List<Long>, granularity: Granularity, zone: ZoneId): List<Bucket> {
        if (granularity == Granularity.Day) {
            return days.mapIndexed { i, dayMs -> Bucket(dayMs, days.getOrNull(i + 1) ?: window.end) }
        }
        val buckets = ArrayList<Bucket>()
        var cursor = window.start
        while (cursor < window.end) {
            // The next calendar boundary after `cursor` (the first bucket may be clipped).
            val at = startOfDayZoned(cursor, zone)
            val boundary = when (granularity) {
                Granularity.Week -> weekStart(at).plusWeeks(1)
                else -> monthStart(at).plusMonths(1)
            }
            val end = minOf(boundary.ms, window.end)
            buckets += Bucket(cursor, end)
            cursor = end
        }
        return buckets
    }

    /** date-fns `startOfDay` in [zone]: on a day starting in a DST gap, the first valid instant. */
    fun startOfDay(ms: Long, zone: ZoneId): Long = midnight(localDate(ms, zone), zone)

    fun localDate(ms: Long, zone: ZoneId): LocalDate = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()

    /** The single refresh window of a period: `[prevWindow.start, window.end)`. */
    fun unionWindow(p: ResolvedPeriod): MsWindow = MsWindow(p.prevWindow.start, p.window.end)

    /*
     * date-fns-in-zone arithmetic. `startOfDay` / `startOfWeek` / `startOfMonth`
     * land on a local midnight (the first valid instant on a day that starts in a
     * DST gap); `addDays` / `addWeeks` / `addMonths` keep the local wall time,
     * which ZonedDateTime.plus* does too. So a window anchored on a gap day's
     * 01:00 stays at 01:00, exactly as on the web.
     */

    private fun startOfDayZoned(ms: Long, zone: ZoneId): ZonedDateTime = localDate(ms, zone).atStartOfDay(zone)

    /** Monday of the week (the one rule shared with the agenda and the widgets), at its start. */
    private fun weekStart(at: ZonedDateTime): ZonedDateTime =
        CalendarWeeks.weekStart(at.toLocalDate().toKotlinLocalDate()).toJavaLocalDate().atStartOfDay(at.zone)

    private fun monthStart(at: ZonedDateTime): ZonedDateTime = at.toLocalDate().withDayOfMonth(1).atStartOfDay(at.zone)

    private val ZonedDateTime.ms: Long get() = toInstant().toEpochMilli()

    private fun midnight(date: LocalDate, zone: ZoneId): Long = date.atStartOfDay(zone).toInstant().toEpochMilli()
}
