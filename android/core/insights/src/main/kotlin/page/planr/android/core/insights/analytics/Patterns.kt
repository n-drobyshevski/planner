package page.planr.android.core.insights.analytics

import java.time.Instant
import java.time.ZoneId
import kotlin.math.max
import kotlin.math.min
import page.planr.android.core.insights.model.Fragmentation
import page.planr.android.core.insights.model.HeatmapCell
import page.planr.android.core.insights.model.HourHeatmap
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.WeekdayUsage
import page.planr.android.core.insights.model.overlap
import page.planr.android.core.insights.period.Periods

/**
 * Weekly and daily rhythm (lib/analytics/patterns.ts): the weekday profile, the
 * weekday×hour heatmap and the fragmentation of busy time into blocks. Labels
 * (weekday, hour, day) are read in an explicit zone; nothing is filtered here,
 * so inactive spans count when the caller lets them through.
 */
object PatternsAnalytics {

    private const val HOUR_MS = 3_600_000L
    private const val SHORT_BLOCK_MS = 30 * 60_000L

    /**
     * patterns.ts `byWeekday`: total and average ms per weekday, Monday first.
     * Day `i` covers `[days[i], days[i + 1] ?: window.end)`, so DST day lengths
     * are honoured; the average divides by how often the weekday occurs.
     */
    fun byWeekday(spans: List<Span>, days: List<Long>, window: MsWindow, zone: ZoneId): List<WeekdayUsage> {
        val totals = LongArray(7)
        val counts = IntArray(7)
        days.forEachIndexed { i, dayMs ->
            val dayEnd = days.getOrNull(i + 1) ?: window.end
            val weekday = weekdayOf(dayMs, zone)
            counts[weekday] += 1
            for (s in spans) totals[weekday] += overlap(s.start, s.end, dayMs, dayEnd)
        }
        return (0 until 7).map { weekday ->
            val count = counts[weekday]
            WeekdayUsage(
                weekday = weekday,
                totalMs = totals[weekday],
                avgMs = if (count > 0) totals[weekday].toDouble() / count else 0.0,
                dayCount = count,
            )
        }
    }

    /**
     * patterns.ts `hourHeatmap`: 168 cells of ms, clipped to [window]. Each
     * one-hour slice goes to the local (weekday, hour) of its start, so a
     * fall-back night's repeated hour accumulates twice into one cell and a
     * spring-forward night's skipped hour gets nothing.
     */
    fun hourHeatmap(spans: List<Span>, window: MsWindow, zone: ZoneId): HourHeatmap {
        val cells = LongArray(168)
        for (s in spans) {
            var cursor = max(s.start, window.start)
            val end = min(s.end, window.end)
            while (cursor < end) {
                val sliceEnd = min(nextHourBoundary(cursor, zone), end)
                val local = Instant.ofEpochMilli(cursor).atZone(zone)
                cells[(local.dayOfWeek.value - 1) * 24 + local.hour] += sliceEnd - cursor
                cursor = sliceEnd
            }
        }
        var maxMs = 0L
        for (ms in cells) if (ms > maxMs) maxMs = ms
        return HourHeatmap(
            cells = cells.mapIndexed { i, ms -> HeatmapCell(weekday = i / 24, hour = i % 24, ms = ms) },
            maxMs = maxMs,
        )
    }

    /**
     * patterns.ts `fragmentation`: spans clipped to [window], split at local
     * midnights and merged per day when they overlap or touch. Gaps are only
     * measured between blocks of the same day.
     */
    fun fragmentation(spans: List<Span>, window: MsWindow, zone: ZoneId): Fragmentation {
        // Clip and split at local midnights, grouped by day start (insertion order, like the TS Map).
        val byDay = LinkedHashMap<Long, MutableList<Piece>>()
        for (s in spans) {
            var cursor = max(s.start, window.start)
            val end = min(s.end, window.end)
            while (cursor < end) {
                val date = Periods.localDate(cursor, zone)
                val dayStart = date.atStartOfDay(zone).toInstant().toEpochMilli()
                val dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
                val pieceEnd = min(dayEnd, end)
                byDay.getOrPut(dayStart) { ArrayList() } += Piece(cursor, pieceEnd)
                cursor = pieceEnd
            }
        }

        val blocks = ArrayList<Long>()
        val gaps = ArrayList<Long>()
        for (pieces in byDay.values) {
            pieces.sortWith(compareBy<Piece> { it.start }.thenBy { it.end })
            var curStart = pieces[0].start
            var curEnd = pieces[0].end
            for (i in 1 until pieces.size) {
                val p = pieces[i]
                if (p.start <= curEnd) {
                    curEnd = max(curEnd, p.end)
                } else {
                    blocks += curEnd - curStart
                    gaps += p.start - curEnd
                    curStart = p.start
                    curEnd = p.end
                }
            }
            blocks += curEnd - curStart
        }

        if (blocks.isEmpty()) {
            return Fragmentation(
                blockCount = 0,
                avgBlockMs = null,
                medianBlockMs = null,
                longestBlockMs = null,
                shortBlockShare = null,
                avgGapMs = null,
            )
        }
        val sorted = blocks.sorted()
        val mid = sorted.size / 2
        val median = if (sorted.size % 2 == 1) sorted[mid].toDouble() else (sorted[mid - 1] + sorted[mid]) / 2.0
        return Fragmentation(
            blockCount = blocks.size,
            avgBlockMs = blocks.sum().toDouble() / blocks.size,
            medianBlockMs = median,
            longestBlockMs = sorted.last(),
            shortBlockShare = blocks.count { it < SHORT_BLOCK_MS }.toDouble() / blocks.size,
            avgGapMs = if (gaps.isEmpty()) null else gaps.sum().toDouble() / gaps.size,
        )
    }

    /**
     * patterns.ts `nextHourBoundary`: the next local hour boundary after [ms].
     * The local minute and second measure the distance to it, which stays
     * right across DST jumps and in fractional-offset zones. Deliberately not
     * `truncatedTo(HOURS).plusHours(1)`, which differs inside a fall-back overlap.
     */
    fun nextHourBoundary(ms: Long, zone: ZoneId): Long {
        val local = Instant.ofEpochMilli(ms).atZone(zone)
        val intoHour = local.minute * 60_000L + local.second * 1_000L + Math.floorMod(ms, 1_000L)
        return ms + HOUR_MS - intoHour
    }

    /** Monday-first weekday (0..6) of an instant in [zone]. */
    private fun weekdayOf(ms: Long, zone: ZoneId): Int = Instant.ofEpochMilli(ms).atZone(zone).dayOfWeek.value - 1

    private class Piece(val start: Long, val end: Long)
}
