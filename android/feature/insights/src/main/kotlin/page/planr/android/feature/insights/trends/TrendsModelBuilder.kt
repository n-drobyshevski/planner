package page.planr.android.feature.insights.trends

import page.planr.android.core.insights.analytics.MomentumAnalytics
import page.planr.android.core.insights.analytics.TrendsAnalytics
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.selectors.TrendsSelectors
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.TrendsModel

/**
 * The Trends tab's model from the filtered inputs (pure, no Android types),
 * ported from trends-tab.tsx:57-116.
 *
 * The one intended difference from the web is the streak (decision 1): it
 * counts back from today, not from the window's last day, so days still ahead
 * in this week or month do not break it. Consistency, anomalies and the trend
 * still see the full series, future zeros included, as on the web.
 */
fun buildTrendsModel(inputs: InsightsInputs): TrendsModel {
    val period = inputs.period
    val granularity = period.granularity
    val buckets = TrendsAnalytics.bucketUsage(inputs.spans, period.buckets)
    val totalMs = buckets.sumOf { it.ms }

    // Day-level momentum only at day granularity, where buckets ≡ days.
    val perDay = TrendsSelectors.perDay(buckets, granularity)
    val rolling = perDay?.let { TrendsAnalytics.rollingAverage(it, ROLLING_DAYS) }
    val anomalies = perDay?.let { MomentumAnalytics.dayAnomalies(it) }.orEmpty()
    val streak = perDay?.let { MomentumAnalytics.elapsedStreak(it, inputs.now) }
    val consistency = perDay?.let { MomentumAnalytics.consistency(it) }
    val trend = MomentumAnalytics.bucketTrend(buckets)

    val byContext = TrendsAnalytics.categoryTrends(inputs.spans, period.buckets, TOP_SERIES)
    val categoryTotals = TrendsSelectors.categoryTotals(byContext)
    val busiest = TrendsSelectors.busiest(buckets)

    return TrendsModel(
        totalMs = totalMs,
        granularity = granularity,
        buckets = buckets,
        busiest = busiest,
        trend = trend,
        lede = Ledes.trends(trend, granularity, busiest),
        rolling = rolling,
        anomalies = anomalies,
        streak = streak,
        consistency = consistency,
        showMomentum = TrendsSelectors.showMomentum(perDay, streak, consistency, anomalies, trend),
        byContext = byContext,
        categoryTotals = categoryTotals,
        topCategoryKey = TrendsSelectors.topCategory(byContext, categoryTotals),
    )
}

/** The trailing average's width (trends-tab.tsx `rollingAverage(…, 7)`). */
private const val ROLLING_DAYS = 7

/** Context series before the rest folds into Other (trends-tab.tsx `categoryTrends(…, 5)`). */
internal const val TOP_SERIES = 5
