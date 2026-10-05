package page.planr.android.core.insights.analytics

import kotlin.math.min
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.CategoryBucketRow
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Delta
import page.planr.android.core.insights.model.RollingPoint
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.overlap

/**
 * Trend aggregations (lib/analytics/trends.ts). Callers pass spans already
 * filtered for Insights; nothing is dropped here.
 */
object TrendsAnalytics {
    /** trends.ts `bucketUsage` (no isTracked check): span time clipped to each bucket. */
    fun bucketUsage(spans: List<Span>, buckets: List<Bucket>): List<BucketUsage> = buckets.map { b ->
        var ms = 0L
        for (s in spans) ms += overlap(s.start, s.end, b.start, b.end)
        BucketUsage(b.start, b.end, ms)
    }

    /** trends.ts `rollingAverage`: trailing mean over up to [windowDays] days, shrinking at the start. */
    fun rollingAverage(perDay: List<DayUsage>, windowDays: Int = 7): List<RollingPoint> {
        val out = ArrayList<RollingPoint>(perDay.size)
        var sum = 0L
        for (i in perDay.indices) {
            sum += perDay[i].ms
            if (i >= windowDays) sum -= perDay[i - windowDays].ms
            val count = min(i + 1, windowDays)
            out += RollingPoint(perDay[i].dayMs, sum.toDouble() / count)
        }
        return out
    }

    /**
     * trends.ts `categoryTrends`: the top [topN] series keys by bucket-clipped
     * total, the rest folded into [SeriesKeys.OTHER]. Totals fill bucket-major,
     * then in span order, and the ranking is stable, so equal totals keep
     * first-seen order. Every row carries every series key (zeros included).
     */
    fun categoryTrends(spans: List<Span>, buckets: List<Bucket>, topN: Int = 5): CategoryBuckets {
        val totals = LinkedHashMap<String, Long>()
        val perBucket = buckets.map { b ->
            val byCat = LinkedHashMap<String, Long>()
            for (s in spans) {
                val ms = overlap(s.start, s.end, b.start, b.end)
                if (ms <= 0) continue
                val key = SeriesKeys.of(s.categoryId)
                byCat[key] = (byCat[key] ?: 0L) + ms
                totals[key] = (totals[key] ?: 0L) + ms
            }
            byCat
        }

        val ranked = totals.entries.map { it.key to it.value }.sortedWith { a, b -> b.second.compareTo(a.second) }
        val top = ranked.take(topN).map { it.first }
        val folded = ranked.size > topN
        val seriesKeys = if (folded) top + SeriesKeys.OTHER else top
        val topSet = top.toHashSet()

        val rows = buckets.mapIndexed { i, b ->
            val byKey = LinkedHashMap<String, Long>()
            for (key in seriesKeys) byKey[key] = 0L
            for ((key, ms) in perBucket[i]) {
                val target = if (key in topSet) key else SeriesKeys.OTHER
                byKey[target] = byKey.getValue(target) + ms
            }
            CategoryBucketRow(b.start, b.end, byKey)
        }
        return CategoryBuckets(seriesKeys, rows)
    }

    /** trends.ts `delta`. */
    fun delta(current: Double, previous: Double): Delta = DeltaMath.delta(current, previous)
}
