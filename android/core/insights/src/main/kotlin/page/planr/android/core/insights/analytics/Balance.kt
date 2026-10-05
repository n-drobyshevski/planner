package page.planr.android.core.insights.analytics

import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.overlap

/**
 * Category balance (lib/analytics/balance.ts). Callers pass spans already
 * filtered for Insights; nothing is dropped here.
 */
object BalanceAnalytics {
    /**
     * balance.ts `categoryShares`: each category's share of its window's
     * total and the shift vs the previous window. Current categories first,
     * then previous-only ones; stable-sorted by ms, then previous ms, descending.
     */
    fun categoryShares(
        current: List<Span>,
        previous: List<Span>,
        curWindow: MsWindow,
        prevWindow: MsWindow,
    ): List<CategoryShare> {
        val cur = totalsByCategory(current, curWindow)
        val prev = totalsByCategory(previous, prevWindow)
        val curTotal = cur.values.sum()
        val prevTotal = prev.values.sum()

        val ids = LinkedHashSet<String?>().apply {
            addAll(cur.keys)
            addAll(prev.keys)
        }
        return ids.map { categoryId ->
            val ms = cur[categoryId] ?: 0L
            val prevMs = prev[categoryId] ?: 0L
            val share = if (curTotal > 0) ms.toDouble() / curTotal else 0.0
            val prevShare = if (prevTotal > 0) prevMs.toDouble() / prevTotal else 0.0
            CategoryShare(categoryId, ms, share, prevMs, prevShare, share - prevShare)
        }.sortedWith { a, b ->
            val byMs = b.ms.compareTo(a.ms)
            if (byMs != 0) byMs else b.prevMs.compareTo(a.prevMs)
        }
    }

    /** balance.ts `categoryByBucket`. */
    fun categoryByBucket(spans: List<Span>, buckets: List<Bucket>, topN: Int = 5): CategoryBuckets =
        TrendsAnalytics.categoryTrends(spans, buckets, topN)

    private fun totalsByCategory(spans: List<Span>, window: MsWindow): LinkedHashMap<String?, Long> {
        val totals = LinkedHashMap<String?, Long>()
        for (s in spans) {
            val ms = overlap(s.start, s.end, window.start, window.end)
            if (ms <= 0) continue
            totals[s.categoryId] = (totals[s.categoryId] ?: 0L) + ms
        }
        return totals
    }
}
