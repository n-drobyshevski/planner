package page.planr.android.core.insights.analytics

import java.time.ZoneId
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.VelocityPoint
import page.planr.android.core.insights.period.Periods

/**
 * Task throughput (lib/analytics/task-stats.ts). Only top-level tasks count
 * (`parentId == null`): subtasks are checklist items and would double-count.
 * Due dates are zone-free calendar dates, judged in the viewer's zone.
 */
object TaskAnalytics {

    /**
     * task-stats.ts `computeTaskStats`. Overdue is a present-state number: open
     * tasks due before today (as of [now]), whatever the window.
     */
    fun computeTaskStats(tasks: List<InsightTask>, window: MsWindow, now: Long, zone: ZoneId): TaskStats {
        val today = Periods.localDate(now, zone)
        var createdCount = 0
        var createdCompleted = 0
        var completedCount = 0
        var dueCount = 0
        var onTime = 0
        var overdueOpenCount = 0
        val leadTimes = ArrayList<Long>()

        for (t in tasks) {
            if (t.parentId != null) continue
            if (inWindow(t.createdAt, window)) {
                createdCount += 1
                if (t.completedAt != null) createdCompleted += 1
            }
            if (t.completedAt != null && inWindow(t.completedAt, window)) {
                completedCount += 1
                leadTimes += t.completedAt - t.createdAt
            }
            if (dueInWindow(t, window, zone)) {
                dueCount += 1
                if (completedOnTime(t, zone)) onTime += 1
            }
            if (t.completedAt == null && t.dueDate != null && t.dueDate < today) overdueOpenCount += 1
        }

        leadTimes.sort()
        val mid = leadTimes.size / 2
        val medianLeadTimeMs = when {
            leadTimes.isEmpty() -> null
            leadTimes.size % 2 == 1 -> leadTimes[mid].toDouble()
            else -> (leadTimes[mid - 1] + leadTimes[mid]) / 2.0
        }
        return TaskStats(
            createdCount = createdCount,
            completedCount = completedCount,
            dueCount = dueCount,
            adherenceRate = if (dueCount > 0) onTime.toDouble() / dueCount else null,
            overdueOpenCount = overdueOpenCount,
            completionRate = if (createdCount > 0) createdCompleted.toDouble() / createdCount else null,
            medianLeadTimeMs = medianLeadTimeMs,
        )
    }

    /** task-stats.ts `taskVelocity`: created vs completed per bucket. */
    fun taskVelocity(tasks: List<InsightTask>, buckets: List<Bucket>): List<VelocityPoint> {
        val top = tasks.filter { it.parentId == null }
        return buckets.map { b ->
            VelocityPoint(
                start = b.start,
                end = b.end,
                created = top.count { inWindow(it.createdAt, b) },
                completed = top.count { it.completedAt != null && inWindow(it.completedAt, b) },
            )
        }
    }

    private fun inWindow(ms: Long, window: MsWindow): Boolean = ms >= window.start && ms < window.end

    /** The due day's local start lies inside the window. */
    private fun dueInWindow(t: InsightTask, window: MsWindow, zone: ZoneId): Boolean {
        val due = t.dueDate ?: return false
        return inWindow(due.atStartOfDay(zone).toInstant().toEpochMilli(), window)
    }

    /** Completed on or before the due day, compared as local dates (the web's day-token compare). */
    private fun completedOnTime(t: InsightTask, zone: ZoneId): Boolean {
        val completedAt = t.completedAt ?: return false
        val due = t.dueDate ?: return false
        return Periods.localDate(completedAt, zone) <= due
    }
}
