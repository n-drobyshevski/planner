package page.planr.android.core.insights.analytics

import java.time.ZoneId
import page.planr.android.core.insights.model.Fragmentation
import page.planr.android.core.insights.model.HourHeatmap
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.WeekdayUsage

/** Weekly and daily rhythm (lib/analytics/patterns.ts). */
object PatternsAnalytics {
    /** patterns.ts `byWeekday`. */
    fun byWeekday(spans: List<Span>, days: List<Long>, window: MsWindow, zone: ZoneId): List<WeekdayUsage> =
        TODO("A2")

    /** patterns.ts `hourHeatmap`. */
    fun hourHeatmap(spans: List<Span>, window: MsWindow, zone: ZoneId): HourHeatmap = TODO("A2")

    /** patterns.ts `fragmentation`. */
    fun fragmentation(spans: List<Span>, window: MsWindow, zone: ZoneId): Fragmentation = TODO("A2")

    /** patterns.ts `nextHourBoundary` (public for tests). */
    fun nextHourBoundary(ms: Long, zone: ZoneId): Long = TODO("A2")
}
