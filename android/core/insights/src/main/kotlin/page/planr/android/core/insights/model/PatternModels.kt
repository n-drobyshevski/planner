package page.planr.android.core.insights.model

/** patterns.ts `WeekdayUsage`; [weekday] 0 = Monday … 6 = Sunday. */
data class WeekdayUsage(val weekday: Int, val totalMs: Long, val avgMs: Double, val dayCount: Int)

/** patterns.ts `HeatmapCell`. */
data class HeatmapCell(val weekday: Int, val hour: Int, val ms: Long)

/** patterns.ts `HourHeatmap`: 168 [cells], index `weekday * 24 + hour`. */
data class HourHeatmap(val cells: List<HeatmapCell>, val maxMs: Long)

/** patterns.ts `Fragmentation`. */
data class Fragmentation(
    val blockCount: Int,
    val avgBlockMs: Double?,
    val medianBlockMs: Double?,
    val longestBlockMs: Long?,
    val shortBlockShare: Double?,
    val avgGapMs: Double?,
)
