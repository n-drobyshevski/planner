package page.planr.android.core.insights.model

/** task-stats.ts `TaskStats`. */
data class TaskStats(
    val createdCount: Int,
    val completedCount: Int,
    val dueCount: Int,
    val adherenceRate: Double?,
    val overdueOpenCount: Int,
    val completionRate: Double?,
    val medianLeadTimeMs: Double?,
)

/** task-stats.ts `VelocityPoint`. */
data class VelocityPoint(val start: Long, val end: Long, val created: Int, val completed: Int)
