package page.planr.android.core.insights.analytics

import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Delta
import page.planr.android.core.insights.model.RollingPoint
import page.planr.android.core.insights.model.Span

/** Trend aggregations (lib/analytics/trends.ts). */
object TrendsAnalytics {
    /** trends.ts `bucketUsage` (no isTracked check). */
    fun bucketUsage(spans: List<Span>, buckets: List<Bucket>): List<BucketUsage> = TODO("A1")

    /** trends.ts `rollingAverage`. */
    fun rollingAverage(perDay: List<DayUsage>, windowDays: Int = 7): List<RollingPoint> = TODO("A1")

    /** trends.ts `categoryTrends`. */
    fun categoryTrends(spans: List<Span>, buckets: List<Bucket>, topN: Int = 5): CategoryBuckets = TODO("A1")

    /** trends.ts `delta`. */
    fun delta(current: Double, previous: Double): Delta = DeltaMath.delta(current, previous)
}
