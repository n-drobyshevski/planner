package page.planr.android.feature.insights.overview

import page.planr.android.core.insights.analytics.BalanceAnalytics
import page.planr.android.core.insights.analytics.DeltaMath
import page.planr.android.core.insights.analytics.TaskAnalytics
import page.planr.android.core.insights.analytics.UsageAnalytics
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.TopContext
import page.planr.android.core.insights.selectors.OverviewSelectors
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.OverviewLead
import page.planr.android.feature.insights.model.OverviewModel
import page.planr.android.feature.insights.model.OverviewStat

/** The Overview tab's model from the filtered inputs (pure, no Android types); overview-tab.tsx:119-246. */
fun buildOverviewModel(inputs: InsightsInputs): OverviewModel {
    val p = inputs.period
    // includeInactive: the filter already decided which inactive blocks count (overview-tab.tsx:121).
    val usage = UsageAnalytics.computeUsage(inputs.spans, p.days, p.window, includeInactive = true)
    val prevUsage = UsageAnalytics.computeUsage(inputs.prevSpans, p.prevDays, p.prevWindow, includeInactive = true)
    val taskStats = TaskAnalytics.computeTaskStats(inputs.tasks, p.window, inputs.now, inputs.zone)
    val prevTaskStats = TaskAnalytics.computeTaskStats(inputs.tasks, p.prevWindow, inputs.now, inputs.zone)

    val total = usage.summary.totalMs
    val prevTotal = prevUsage.summary.totalMs
    val topContext = usage.byCategory.firstOrNull()?.let { TopContext(SeriesKeys.of(it.categoryId), it.ms) }

    // The dashboard registry's order minus the lead figures and goals (dashboard.ts:37-51).
    val stats = listOf(
        OverviewStat.Events(usage.summary.eventCount, DeltaMath.delta(usage.summary.eventCount, prevUsage.summary.eventCount)),
        OverviewStat.AvgSession(OverviewSelectors.avgSessionMs(usage.summary)),
        OverviewStat.BusiestDay(usage.summary.busiestDay),
        OverviewStat.TasksDone(taskStats.completedCount, DeltaMath.delta(taskStats.completedCount, prevTaskStats.completedCount)),
        OverviewStat.OnTime(taskStats.adherenceRate, taskStats.dueCount),
        OverviewStat.Overdue(taskStats.overdueOpenCount),
    )

    return OverviewModel(
        totalMs = total,
        lede = Ledes.overview(total, prevTotal, inputs.state.preset, topContext),
        lead = OverviewLead(total, usage.summary.dailyAverageMs, usage.summary.activeDays, p.days.size),
        stats = stats,
        perDay = OverviewSelectors.perDaySeries(usage, prevUsage),
        typicalDayMs = OverviewSelectors.typicalDayMs(usage.perDay, prevUsage.perDay),
        totalChange = OverviewSelectors.totalChange(total, prevTotal),
        shares = OverviewSelectors.shareRows(usage.byCategory),
        // Shifts only mean something with time on both sides; skip the shares work otherwise.
        shifts = if (total == 0L || prevTotal == 0L) {
            emptyList()
        } else {
            OverviewSelectors.shiftChips(
                BalanceAnalytics.categoryShares(inputs.spans, inputs.prevSpans, p.window, p.prevWindow),
                total,
                prevTotal,
            )
        },
        busiestDay = usage.summary.busiestDay,
    )
}
