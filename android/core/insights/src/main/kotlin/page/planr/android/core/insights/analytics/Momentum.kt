package page.planr.android.core.insights.analytics

import page.planr.android.core.insights.model.Anomaly
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Streak
import page.planr.android.core.insights.model.TrendDirection

/** Momentum signals (lib/analytics/momentum.ts). */
object MomentumAnalytics {
    const val MIN_TREND_BUCKETS = 4
    const val FLAT_SHARE = 0.1
    const val MIN_CONSISTENCY_DAYS = 7
    const val CONSISTENCY_BAND = 0.5
    const val DEFAULT_ANOMALY_MIN_SAMPLE = 14
    const val DEFAULT_ANOMALY_Z = 3.0
    const val ANOMALY_CAP = 5

    /** momentum.ts `bucketTrend`. */
    fun bucketTrend(buckets: List<BucketUsage>): TrendDirection = TODO("A1")

    /** momentum.ts `activeStreak`. */
    fun activeStreak(perDay: List<DayUsage>, minMsPerDay: Long = 1): Streak = TODO("A1")

    /** momentum.ts `consistency`. */
    fun consistency(perDay: List<DayUsage>): Double? = TODO("A1")

    /** momentum.ts `dayAnomalies`. */
    fun dayAnomalies(perDay: List<DayUsage>, minSample: Int = 14, zThreshold: Double = 3.0): List<Anomaly> =
        TODO("A1")

    /**
     * The streak counted back from min(window end, today): the days with
     * `dayMs <= now` only (optimize-tab.tsx:244-247); null when there are none.
     */
    fun elapsedStreak(perDay: List<DayUsage>, now: Long): Streak? = TODO("A1")
}
