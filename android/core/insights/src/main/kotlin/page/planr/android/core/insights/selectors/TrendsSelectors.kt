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
    fun busiest(buckets: List<BucketUsage>): BucketUsage? {
        var best = buckets.firstOrNull() ?: return null
        for (b in buckets) if (b.ms > best.ms) best = b
        return best
    }

    /** `perDayFromBuckets`: the day series, at Day granularity only (where buckets ≡ days). */
    fun perDay(buckets: List<BucketUsage>, g: Granularity): List<DayUsage>? =
        if (g == Granularity.Day) buckets.map { DayUsage(it.start, it.ms) } else null

    /** `categoryTotals`: a LinkedHashMap filled row by row, then key by key. */
    fun categoryTotals(cb: CategoryBuckets): Map<String, Long> {
        val totals = LinkedHashMap<String, Long>()
        for (row in cb.rows) {
            for ((key, ms) in row.byKey) totals[key] = (totals[key] ?: 0L) + ms
        }
        return totals
    }

    /** `topCategory`: strict `>` over the series keys (a missing total reads 0), the first wins; null without series. */
    fun topCategory(cb: CategoryBuckets, totals: Map<String, Long>): String? {
        var top = cb.seriesKeys.firstOrNull() ?: return null
        for (key in cb.seriesKeys) if ((totals[key] ?: 0L) > (totals[top] ?: 0L)) top = key
        return top
    }

    /**
     * `showMomentum`: only with a day series (an empty one counts, as `[]` is
     * truthy in JS), and only when one of its figures has something to show.
     */
    fun showMomentum(
        perDay: List<DayUsage>?,
        streak: Streak?,
        consistency: Double?,
        anomalies: List<Anomaly>,
        trend: TrendDirection,
    ): Boolean = perDay != null &&
        (streak != null || consistency != null || anomalies.isNotEmpty() || trend.direction != null)
}
