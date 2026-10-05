package page.planr.android.feature.insights.tasks

import page.planr.android.core.insights.analytics.TaskAnalytics
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.selectors.TasksSelectors
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.TasksModel

/**
 * The Tasks tab's model from the filtered inputs (pure, no Android types).
 * tasks-tab.tsx:76-132: stats for the current and previous windows (overdue
 * as of the VM's `now`), velocity over the period's buckets, and the lede.
 */
fun buildTasksModel(inputs: InsightsInputs): TasksModel {
    val period = inputs.period
    val stats = TaskAnalytics.computeTaskStats(inputs.tasks, period.window, inputs.now, inputs.zone)
    val prevStats = TaskAnalytics.computeTaskStats(inputs.tasks, period.prevWindow, inputs.now, inputs.zone)
    return TasksModel(
        hasTopLevel = TasksSelectors.hasTopLevel(inputs.tasks),
        stats = stats,
        prevStats = prevStats,
        lede = Ledes.tasks(stats, prevStats, inputs.state.preset),
        leadTime = stats.medianLeadTimeMs?.let(TasksSelectors::leadTime),
        granularity = period.granularity,
        velocity = TaskAnalytics.taskVelocity(inputs.tasks, period.buckets),
    )
}
