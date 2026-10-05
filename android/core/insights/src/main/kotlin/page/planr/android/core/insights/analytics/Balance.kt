package page.planr.android.core.insights.analytics

import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span

/** Category balance (lib/analytics/balance.ts). */
object BalanceAnalytics {
    /** balance.ts `categoryShares`. */
    fun categoryShares(
        current: List<Span>,
        previous: List<Span>,
        curWindow: MsWindow,
        prevWindow: MsWindow,
    ): List<CategoryShare> = TODO("A1")

    /** balance.ts `categoryByBucket`. */
    fun categoryByBucket(spans: List<Span>, buckets: List<Bucket>, topN: Int = 5): CategoryBuckets =
        TrendsAnalytics.categoryTrends(spans, buckets, topN)
}
