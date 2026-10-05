package page.planr.android.core.insights.selectors

import kotlin.math.floor
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.LeadTime

/** The Tasks tab's view logic (lib/insights/view-selectors.ts, Tasks group). */
object TasksSelectors {
    private const val DAY_MS = 86_400_000.0
    private const val HOUR_MS = 3_600_000.0

    /** `hasTopLevelTasks`. */
    fun hasTopLevel(tasks: List<InsightTask>): Boolean = tasks.any { it.parentId == null }

    /**
     * `leadTimeParts`: under 2 days → [LeadTime.Short]; else days = floor(ms / DAY),
     * hours = JsMath.round((ms % DAY) / 3_600_000). Hours CAN be 24 ("2d 24h"), as on the web.
     */
    fun leadTime(ms: Double): LeadTime {
        if (ms < 2 * DAY_MS) return LeadTime.Short(ms)
        // Kotlin's Double `%` is IEEE fmod, like JS `%`.
        return LeadTime.DaysHours(
            days = floor(ms / DAY_MS).toLong(),
            hours = JsMath.roundToLong((ms % DAY_MS) / HOUR_MS),
        )
    }
}
