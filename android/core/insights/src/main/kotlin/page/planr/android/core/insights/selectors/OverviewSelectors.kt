package page.planr.android.core.insights.selectors

import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.CategoryUsage
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.PerDayPoint
import page.planr.android.core.insights.model.ShareRow
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.Usage
import page.planr.android.core.insights.model.UsageSummary

/** The Overview tab's view logic (lib/insights/view-selectors.ts, Overview group). */
object OverviewSelectors {
    /** Categories shown individually in the share bar before folding into "Other". */
    const val TOP_CATEGORIES = 6

    /** `perDaySeries`: 7-day rolling average; the previous period aligned by index, null when absent. */
    fun perDaySeries(cur: Usage, prev: Usage): List<PerDayPoint> = TODO("T1")

    /** `typicalDayMs`: the median nonzero day of both windows. */
    fun typicalDayMs(cur: List<DayUsage>, prev: List<DayUsage>): Double = TODO("T1")

    /** `shareRows`: the top [TOP_CATEGORIES] plus Other (the sum of the rest), only when more. */
    fun shareRows(byCategory: List<CategoryUsage>): List<ShareRow> = TODO("T1")

    /** `shiftChips`: empty if either total is 0; |Δ| ≥ 0.02; stable sort by |Δ| descending; at most 3. */
    fun shiftChips(shares: List<CategoryShare>, curTotal: Long, prevTotal: Long): List<CategoryShare> = TODO("T1")

    /** `totalChange`. */
    fun totalChange(total: Long, prevTotal: Long): TotalChange = TODO("T1")

    /** `avgSessionMs`: null when there are no events. */
    fun avgSessionMs(summary: UsageSummary): Double? = TODO("T1")

    /** The shift chip's points (overview-tab.tsx: `Math.round(deltaShare * 100)`). */
    fun shiftPoints(deltaShare: Double): Int = JsMath.roundToInt(deltaShare * 100)
}
