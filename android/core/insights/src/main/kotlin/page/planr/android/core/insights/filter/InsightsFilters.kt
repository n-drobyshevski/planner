package page.planr.android.core.insights.filter

import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.Span
import page.planr.android.core.model.EventKind

/** The viewer and the hidden categories the Insights numbers are scoped by. */
data class InsightsFilter(
    val viewerId: String,
    /** Category ids left out of the numbers (uncategorized can't be hidden). */
    val hiddenCategoryIds: Set<String>,
    /** Count grayed-out blocks (e.g. sleep) too. */
    val includeInactive: Boolean,
)

/**
 * The viewer's own slice (lib/insights/filters.ts): an occurrence counts only
 * when the viewer owns it or it is joint; the partner's solo events never
 * enter the numbers, whatever the agenda's partner toggle says.
 */
object InsightsFilters {

    /** usage.ts `isTracked`: a timed, normal event (inactive only when [includeInactive]). */
    fun isTracked(s: Span, includeInactive: Boolean = false): Boolean =
        s.kind == EventKind.Event && !s.allDay && (includeInactive || !s.inactive)

    /** filters.ts `filterForInsights`: tracked + viewer + category, one pass, order kept. */
    fun filterForInsights(spans: List<Span>, filter: InsightsFilter): List<Span> = spans.filter { s ->
        isTracked(s, filter.includeInactive) &&
            (s.ownerId == filter.viewerId || s.isShared) &&
            (s.categoryId == null || s.categoryId !in filter.hiddenCategoryIds)
    }

    /** insights-shell.tsx: tasks the viewer owns or is assigned, order kept. */
    fun viewerTasks(tasks: List<InsightTask>, viewerId: String): List<InsightTask> =
        tasks.filter { it.ownerId == viewerId || it.assigneeId == viewerId }
}
