package page.planr.android.feature.insights.model

import page.planr.android.core.insights.model.Anomaly
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.RollingPoint
import page.planr.android.core.insights.model.Streak
import page.planr.android.core.insights.model.TrendDirection

/** The Trends tab (trends-tab.tsx). */
data class TrendsModel(
    /** Σ buckets; 0 → the empty state. */
    val totalMs: Long,
    val granularity: Granularity,
    val buckets: List<BucketUsage>,
    val busiest: BucketUsage?,
    val trend: TrendDirection,
    val lede: Lede,
    /** Day granularity only. */
    val rolling: List<RollingPoint>?,
    /** Day granularity only, else empty. */
    val anomalies: List<Anomaly>,
    /** Day granularity only: MomentumAnalytics.elapsedStreak(perDay, now). */
    val streak: Streak?,
    /** Day granularity only. */
    val consistency: Double?,
    val showMomentum: Boolean,
    /** categoryTrends(spans, buckets, 5). */
    val byContext: CategoryBuckets,
    val categoryTotals: Map<String, Long>,
    val topCategoryKey: String?,
)
