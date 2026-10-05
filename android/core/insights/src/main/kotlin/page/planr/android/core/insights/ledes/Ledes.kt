package page.planr.android.core.insights.ledes

import kotlin.math.abs
import page.planr.android.core.insights.analytics.DeltaMath
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.ComparisonUnit
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.Delta
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.LedeTone
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.TopContext
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.TrendKind
import page.planr.android.core.insights.model.WeekdayUsage

/**
 * The one-sentence answers above each tab (lib/insights/ledes.ts), as structured lines.
 *
 * The web passes each line through its translator; here a line is the message
 * key plus its ICU arguments in the same order, and the UI resolves them per
 * locale. Tone is two-valued: Attention only for overdue tasks, never a "good" tone.
 */
object Ledes {
    /** ledes.ts `comparisonNoun`. */
    fun comparisonNoun(preset: PeriodPreset): ComparisonUnit = when (preset) {
        PeriodPreset.ThisWeek, PeriodPreset.LastWeek -> ComparisonUnit.Week
        PeriodPreset.ThisMonth -> ComparisonUnit.Month
        else -> ComparisonUnit.Period
    }

    /** ledes.ts `deriveOverviewLede`; null when [totalMs] is 0. */
    fun overview(totalMs: Long, prevTotalMs: Long, preset: PeriodPreset, topContext: TopContext?): Lede? {
        if (totalMs == 0L) return null // the tab renders its own empty state
        val d = DeltaMath.delta(totalMs, prevTotalMs)
        val dir = changeDirection(d)
        val headline = LedeLine(
            "lede.overviewHeadline",
            linkedMapOf(
                "total" to LedeArg.Duration(totalMs.toDouble()),
                // "none" carries the no-comparison case (no previous window).
                "direction" to LedeArg.Select(dir ?: "none"),
                "unit" to LedeArg.Select(comparisonNoun(preset).id),
                "pct" to LedeArg.Num(
                    if (dir == "up" || dir == "down") JsMath.roundToLong(abs(d.deltaPct!!) * 100) else 0L,
                ),
                "magnitude" to LedeArg.Duration(abs(d.delta)),
            ),
        )
        val support = if (topContext != null && topContext.ms > 0) {
            LedeLine(
                "lede.overviewSupport",
                linkedMapOf(
                    "name" to LedeArg.Category(topContext.seriesKey),
                    "pct" to LedeArg.Num(JsMath.percentOf(topContext.ms.toDouble(), totalMs.toDouble()).toLong()),
                ),
            )
        } else {
            null
        }
        return Lede(LedeTone.Neutral, headline, support)
    }

    /** ledes.ts `deriveTrendsLede`; a null [busiest] means no support line. */
    fun trends(trend: TrendDirection, granularity: Granularity, busiest: BucketUsage?): Lede {
        val direction = trend.direction
            ?: return Lede(
                LedeTone.Neutral,
                LedeLine("lede.trendsNoneHeadline", emptyMap()),
                LedeLine("lede.trendsNoneSupport", emptyMap()),
            )
        val slope = trend.slopeMsPerBucket
        val headline = LedeLine(
            "lede.trendsHeadline",
            linkedMapOf(
                "direction" to LedeArg.Select(direction.id),
                "granularity" to LedeArg.Select(granularity.id),
                // Whether to append the "about ±Xh per <unit>" rate clause.
                "hasRate" to LedeArg.Select(if (direction != TrendKind.Flat && slope != null) "yes" else "no"),
                "sign" to LedeArg.Select(if (slope != null && slope > 0) "+" else "−"),
                // The web passes "" without a slope; `hasRate` is "no" then, so the rate is never shown.
                "rate" to LedeArg.Duration(abs(slope ?: 0.0)),
            ),
        )
        val support = busiest?.let {
            LedeLine(
                "lede.trendsSupport",
                linkedMapOf(
                    "granularity" to LedeArg.Select(granularity.id),
                    "busiest" to LedeArg.BucketRef(it.start, it.end, granularity),
                    "ms" to LedeArg.Duration(it.ms.toDouble()),
                ),
            )
        }
        return Lede(LedeTone.Neutral, headline, support)
    }

    /** ledes.ts `derivePatternsLede`; null without a top weekday or with its average ≤ 0. */
    fun patterns(topWeekday: WeekdayUsage?, bestDaypart: Daypart?, medianBlockMs: Double?): Lede? {
        if (topWeekday == null || topWeekday.avgMs <= 0) return null
        val headline = LedeLine(
            "lede.patternsHeadline",
            linkedMapOf(
                "weekday" to LedeArg.Weekday(topWeekday.weekday),
                "ms" to LedeArg.Duration(topWeekday.avgMs),
            ),
        )
        val support = when {
            bestDaypart != null ->
                LedeLine("lede.patternsSupportDaypart", linkedMapOf("daypart" to LedeArg.DaypartRef(bestDaypart)))
            medianBlockMs != null ->
                LedeLine("lede.patternsSupportBlock", linkedMapOf("ms" to LedeArg.Duration(medianBlockMs)))
            else -> null
        }
        return Lede(LedeTone.Neutral, headline, support)
    }

    /** ledes.ts `deriveTasksLede`. */
    fun tasks(stats: TaskStats, prevStats: TaskStats, preset: PeriodPreset): Lede {
        val unit = comparisonNoun(preset)
        val done = stats.completedCount.toLong()

        if (stats.overdueOpenCount > 0) {
            val overdue = stats.overdueOpenCount.toLong()
            return Lede(
                LedeTone.Attention,
                LedeLine("lede.tasksOverdueHeadline", linkedMapOf("count" to LedeArg.Num(overdue))),
                LedeLine("lede.tasksDoneSupport", linkedMapOf("count" to LedeArg.Num(done))),
            )
        }

        val d = DeltaMath.delta(stats.completedCount, prevStats.completedCount)
        // "level" suppresses the comparison clause (no previous window, or no move).
        val level = d.deltaPct == null || d.delta == 0.0
        val headline = LedeLine(
            "lede.tasksDoneHeadline",
            linkedMapOf(
                "count" to LedeArg.Num(done),
                "direction" to LedeArg.Select(if (level) "level" else if (d.delta > 0) "more" else "fewer"),
                "diff" to LedeArg.Num(if (level) 0L else abs(d.delta).toLong()),
                "unit" to LedeArg.Select(unit.id),
            ),
        )
        val support = stats.adherenceRate?.let {
            LedeLine("lede.tasksAdherenceSupport", linkedMapOf("pct" to LedeArg.Num(JsMath.roundToLong(it * 100))))
        }
        return Lede(LedeTone.Neutral, headline, support)
    }

    /**
     * ledes.ts `changeDirection`: null when the previous window was empty (the
     * clause is dropped), else "level" / "up" / "down". [Delta.deltaPct] is
     * unboxed before the zero test (§H.4).
     */
    private fun changeDirection(d: Delta): String? {
        val pct: Double = d.deltaPct ?: return null
        if (pct == 0.0) return "level"
        return if (pct > 0) "up" else "down"
    }
}
