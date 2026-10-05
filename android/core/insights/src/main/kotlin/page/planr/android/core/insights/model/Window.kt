package page.planr.android.core.insights.model

import kotlin.math.max
import kotlin.math.min
import kotlin.time.Instant
import page.planr.android.core.model.TimeWindow

/** Half-open `[start, end)` in epoch ms (the web's `TimeWindow` / `Bucket`). */
data class MsWindow(val start: Long, val end: Long) {
    init {
        require(end >= start) { "MsWindow end ($end) is before start ($start)" }
    }
}

/** A period bucket (period.ts `Bucket`): the same half-open shape. */
typealias Bucket = MsWindow

/**
 * Overlap (ms, ≥ 0) of `[aStart, aEnd)` with `[bStart, bEnd)`; the `overlap`
 * duplicated in usage.ts, trends.ts, balance.ts, patterns.ts and correlations.ts.
 */
fun overlap(aStart: Long, aEnd: Long, bStart: Long, bEnd: Long): Long =
    max(0L, min(aEnd, bEnd) - max(aStart, bStart))

fun TimeWindow.toMs(): MsWindow = MsWindow(start.toEpochMilliseconds(), end.toEpochMilliseconds())

fun MsWindow.toTimeWindow(): TimeWindow =
    TimeWindow(Instant.fromEpochMilliseconds(start), Instant.fromEpochMilliseconds(end))
