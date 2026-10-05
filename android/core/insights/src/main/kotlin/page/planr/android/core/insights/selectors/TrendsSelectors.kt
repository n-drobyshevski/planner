package page.planr.android.core.insights.selectors

import page.planr.android.core.insights.model.Anomaly
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.Streak
import page.planr.android.core.insights.model.TrendDirection

/** The Trends tab's view logic (lib/insights/view-selectors.ts, Trends group). */
object TrendsSelectors {
    /** `busiestBucket`: strict `>`, the first maximum wins; null when empty. */
    fun busiest(buckets: List<BucketUsage>): BucketUsage? = TODO("T2")

    /** `perDayFromBuckets`: the day series, at Day granularity only. */
    fun perDay(buckets: List<BucketUsage>, g: Granularity): List<DayUsage>? = TODO("T2")

    /** `categoryTotals`: a LinkedHashMap filled row by row, then key by key. */
    fun categoryTotals(cb: CategoryBuckets): Map<String, Long> = TODO("T2")

    /** `topCategory`: strict `>`, the first wins; null without series. */
    fun topCategory(cb: CategoryBuckets, totals: Map<String, Long>): String? = TODO("T2")

    /** `showMomentum`. */
    fun showMomentum(
        perDay: List<DayUsage>?,
        streak: Streak?,
        consistency: Double?,
        anomalies: List<Anomaly>,
        trend: TrendDirection,
    ): Boolean = TODO("T2")
}
