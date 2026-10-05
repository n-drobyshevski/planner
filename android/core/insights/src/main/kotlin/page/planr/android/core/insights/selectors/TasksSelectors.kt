package page.planr.android.core.insights.selectors

import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.LeadTime

/** The Tasks tab's view logic (lib/insights/view-selectors.ts, Tasks group). */
object TasksSelectors {
    /** `hasTopLevelTasks`. */
    fun hasTopLevel(tasks: List<InsightTask>): Boolean = TODO("T4")

    /**
     * `leadTimeParts`: under 2 days → [LeadTime.Short]; else days = floor(ms / DAY),
     * hours = JsMath.round((ms % DAY) / 3_600_000). Hours CAN be 24 ("2d 24h"), as on the web.
     */
    fun leadTime(ms: Double): LeadTime = TODO("T4")
}
