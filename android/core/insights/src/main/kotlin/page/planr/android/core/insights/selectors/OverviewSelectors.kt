package page.planr.android.core.insights.selectors

import kotlin.math.abs
import page.planr.android.core.insights.analytics.DeltaMath
import page.planr.android.core.insights.analytics.Stats
import page.planr.android.core.insights.analytics.TrendsAnalytics
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.CategoryUsage
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.PerDayPoint
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.ShareRow
import page.planr.android.core.insights.model.ShareRowId
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.TotalTrend
import page.planr.android.core.insights.model.Usage
import page.planr.android.core.insights.model.UsageSummary

/** The Overview tab's view logic (lib/insights/view-selectors.ts, Overview group). */
object OverviewSelectors {
    /** Categories shown individually in the share bar before folding into "Other". */
    const val TOP_CATEGORIES = 6

    /** `perDaySeries`: 7-day rolling average; the previous period aligned by index, null when absent. */
    fun perDaySeries(cur: Usage, prev: Usage): List<PerDayPoint> {
        val avg = TrendsAnalytics.rollingAverage(cur.perDay, 7)
        // Previous period aligned by position (day 1 vs day 1, …).
        return cur.perDay.mapIndexed { i, d -> PerDayPoint(d.dayMs, d.ms, avg[i].avgMs, prev.perDay.getOrNull(i)?.ms) }
    }

    /** `typicalDayMs`: the median nonzero day of both windows. */
    fun typicalDayMs(cur: List<DayUsage>, prev: List<DayUsage>): Double =
        Stats.median((cur + prev).filter { it.ms > 0 }.map { it.ms.toDouble() })

    /** `shareRows`: the top [TOP_CATEGORIES] plus Other (the sum of the rest), only when more. */
    fun shareRows(byCategory: List<CategoryUsage>): List<ShareRow> {
        val rows = byCategory.map { ShareRow(ShareRowId.Series(SeriesKeys.of(it.categoryId)), it.ms) }
        if (rows.size <= TOP_CATEGORIES) return rows
        val restMs = rows.drop(TOP_CATEGORIES).sumOf { it.ms }
        return rows.take(TOP_CATEGORIES) + ShareRow(ShareRowId.Other, restMs)
    }

    /** `shiftChips`: empty if either total is 0; |Δ| ≥ 0.02; stable sort by |Δ| descending; at most 3. */
    fun shiftChips(shares: List<CategoryShare>, curTotal: Long, prevTotal: Long): List<CategoryShare> {
        if (curTotal == 0L || prevTotal == 0L) return emptyList()
        return shares
            .filter { abs(it.deltaShare) >= SHIFT_MIN }
            .sortedWith { a, b -> abs(b.deltaShare).compareTo(abs(a.deltaShare)) }
            .take(MAX_SHIFTS)
    }

    /** `totalChange`. */
    fun totalChange(total: Long, prevTotal: Long): TotalChange {
        val pctOrNull = DeltaMath.delta(total, prevTotal).deltaPct ?: return TotalChange(TotalTrend.None, 0)
        // Unboxed before comparing, so a -0.0 reads as level (a boxed `== 0.0` would not).
        val p: Double = pctOrNull
        val trend = when {
            p == 0.0 -> TotalTrend.Level
            p > 0.0 -> TotalTrend.Up
            else -> TotalTrend.Down
        }
        return TotalChange(trend, JsMath.roundToInt(abs(p) * 100))
    }

    /** `avgSessionMs`: null when there are no events. */
    fun avgSessionMs(summary: UsageSummary): Double? =
        if (summary.eventCount > 0) summary.totalMs.toDouble() / summary.eventCount else null

    /** The shift chip's points (overview-tab.tsx: `Math.round(deltaShare * 100)`). */
    fun shiftPoints(deltaShare: Double): Int = JsMath.roundToInt(deltaShare * 100)

    /** The smallest share shift that earns a chip (two points). */
    private const val SHIFT_MIN = 0.02

    private const val MAX_SHIFTS = 3
}
