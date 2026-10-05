package page.planr.android.feature.insights.model

import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.CategoryRating
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.DaypartRating
import page.planr.android.core.insights.model.DeepWorkShare
import page.planr.android.core.insights.model.EnergySummary
import page.planr.android.core.insights.model.Fragmentation
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.HourHeatmap
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.WeekdayUsage

/** The Patterns tab (patterns-tab.tsx, balance-tab.tsx, hour-heatmap.tsx). */
data class PatternsModel(
    /** 0 → the empty state. */
    val weekdayTotalMs: Long,
    val weekdays: List<WeekdayUsage>,
    val topWeekday: WeekdayUsage,
    val lede: Lede?,
    val fragmentation: Fragmentation,
    val deepWork: DeepWorkShare,
    val dayparts: List<DaypartRating>,
    val bestDaypart: DaypartRating?,
    /** Already null when it is the best daypart. */
    val worstDaypart: DaypartRating?,
    val energy: EnergySummary,
    val hasAttributes: Boolean,
    val heatmap: HourHeatmap,
    /** 42 four-hour bands. */
    val bands: List<Long>,
    val granularity: Granularity,
    /** categoryByBucket(spans, buckets, 5). */
    val contextMix: CategoryBuckets,
    /** categoryShares(spans, prevSpans, window, prevWindow). */
    val shares: List<CategoryShare>,
    /** Σ shares.ms; 0 hides the balance half. */
    val sharesTotalMs: Long,
    val satisfaction: List<CategoryRating>,
)
