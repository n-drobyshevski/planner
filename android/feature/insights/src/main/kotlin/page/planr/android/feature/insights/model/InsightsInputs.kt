package page.planr.android.feature.insights.model

import java.time.ZoneId
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.model.Span
import page.planr.android.core.model.Category

/** Everything a tab builder needs, already filtered: one immutable snapshot per recompute. */
data class InsightsInputs(
    val viewerId: String,
    val zone: ZoneId,
    /** The ViewModel's `now` anchor (not wall time). */
    val now: Long,
    /** The requested state; its preset drives the ledes' comparison unit. */
    val state: PeriodState,
    val period: ResolvedPeriod,
    /** filterForInsights over the current window. */
    val spans: List<Span>,
    /** filterForInsights over the previous window. */
    val prevSpans: List<Span>,
    /** InsightsFilters.viewerTasks. */
    val tasks: List<InsightTask>,
    /** In sort_order. */
    val categories: Map<String, Category>,
)
