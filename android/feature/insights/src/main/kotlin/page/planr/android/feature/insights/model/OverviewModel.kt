package page.planr.android.feature.insights.model

import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Delta
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.PerDayPoint
import page.planr.android.core.insights.model.ShareRow
import page.planr.android.core.insights.model.TotalChange

/** The Overview tab (overview-tab.tsx). */
data class OverviewModel(
    /** 0 → the empty state. */
    val totalMs: Long,
    val lede: Lede?,
    val lead: OverviewLead,
    /** Fixed order: Events, AvgSession, BusiestDay, TasksDone, OnTime, Overdue. */
    val stats: List<OverviewStat>,
    val perDay: List<PerDayPoint>,
    /** 0.0 → no reference line, the plain footnote. */
    val typicalDayMs: Double,
    /** The per-day headline. */
    val totalChange: TotalChange,
    /** The by-context bar and list. */
    val shares: List<ShareRow>,
    /** At most 3 chips. */
    val shifts: List<CategoryShare>,
    /** For the screen-reader summary. */
    val busiestDay: DayUsage?,
)

/** The lead figures under the lede. */
data class OverviewLead(val totalMs: Long, val dailyAvgMs: Double, val activeDays: Int, val dayCount: Int)

sealed interface OverviewStat {
    data class Events(val count: Int, val delta: Delta) : OverviewStat

    data class AvgSession(val ms: Double?) : OverviewStat

    data class BusiestDay(val day: DayUsage?) : OverviewStat

    data class TasksDone(val count: Int, val delta: Delta) : OverviewStat

    data class OnTime(val rate: Double?, val dueCount: Int) : OverviewStat

    data class Overdue(val count: Int) : OverviewStat
}
