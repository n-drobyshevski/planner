package page.planr.android.core.insights.ledes

import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.ComparisonUnit
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.TopContext
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.WeekdayUsage

/** The one-sentence answers above each tab (lib/insights/ledes.ts), as structured lines. */
object Ledes {
    /** ledes.ts `comparisonNoun`. */
    fun comparisonNoun(preset: PeriodPreset): ComparisonUnit = TODO("A3")

    /** ledes.ts `deriveOverviewLede`; null when [totalMs] is 0. */
    fun overview(totalMs: Long, prevTotalMs: Long, preset: PeriodPreset, topContext: TopContext?): Lede? = TODO("A3")

    /** ledes.ts `deriveTrendsLede`; a null [busiest] means no support line. */
    fun trends(trend: TrendDirection, granularity: Granularity, busiest: BucketUsage?): Lede = TODO("A3")

    /** ledes.ts `derivePatternsLede`; null without a top weekday or with its average ≤ 0. */
    fun patterns(topWeekday: WeekdayUsage?, bestDaypart: Daypart?, medianBlockMs: Double?): Lede? = TODO("A3")

    /** ledes.ts `deriveTasksLede`. */
    fun tasks(stats: TaskStats, prevStats: TaskStats, preset: PeriodPreset): Lede = TODO("A3")
}
