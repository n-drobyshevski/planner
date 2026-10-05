package page.planr.android.feature.insights.model

import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LeadTime
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.VelocityPoint

/** The Tasks tab (tasks-tab.tsx). */
data class TasksModel(
    /** false → the empty state. */
    val hasTopLevel: Boolean,
    val stats: TaskStats,
    val prevStats: TaskStats,
    val lede: Lede,
    /** Null when there is no median lead time. */
    val leadTime: LeadTime?,
    val granularity: Granularity,
    val velocity: List<VelocityPoint>,
)
