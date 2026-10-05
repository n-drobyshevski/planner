package page.planr.android.core.insights.analytics

import java.time.ZoneId
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.VelocityPoint

/** Task throughput (lib/analytics/task-stats.ts). */
object TaskAnalytics {
    /** task-stats.ts `computeTaskStats`. */
    fun computeTaskStats(tasks: List<InsightTask>, window: MsWindow, now: Long, zone: ZoneId): TaskStats = TODO("A2")

    /** task-stats.ts `taskVelocity`. */
    fun taskVelocity(tasks: List<InsightTask>, buckets: List<Bucket>): List<VelocityPoint> = TODO("A2")
}
