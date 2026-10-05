package page.planr.android.feature.insights.patterns

import page.planr.android.core.insights.analytics.BalanceAnalytics
import page.planr.android.core.insights.analytics.CorrelationsAnalytics
import page.planr.android.core.insights.analytics.PatternsAnalytics
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.selectors.HeatmapSteps
import page.planr.android.core.insights.selectors.PatternsSelectors
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.PatternsModel

/**
 * The Patterns tab's model from the filtered inputs (pure, no Android types):
 * patterns-tab.tsx:50-112 (rhythm, attribute lenses, lede), hour-heatmap.tsx:55-61
 * (the 4-hour bands) and balance-tab.tsx:54-81 (the balance half).
 */
fun buildPatternsModel(inputs: InsightsInputs): PatternsModel {
    val period = inputs.period
    val window = period.window
    val zone = inputs.zone
    val spans = inputs.spans

    // Weekday rhythm.
    val weekdays = PatternsAnalytics.byWeekday(spans, period.days, window, zone)
    val topWeekday = PatternsSelectors.topWeekday(weekdays)

    // Attribute lenses; the toughest daypart is only shown when it differs from the best.
    val fragmentation = PatternsAnalytics.fragmentation(spans, window, zone)
    val deepWork = CorrelationsAnalytics.deepWorkShare(spans, window)
    val dayparts = CorrelationsAnalytics.satisfactionByDaypart(spans, window, zone)
    val best = PatternsSelectors.bestDaypart(dayparts)
    val worst = PatternsSelectors.worstDaypart(dayparts)?.takeIf { it.daypart != best?.daypart }
    val energy = PatternsSelectors.energySummary(CorrelationsAnalytics.energyLoadPerDay(spans, period.days, window))

    val heatmap = PatternsAnalytics.hourHeatmap(spans, window, zone)

    // Balance half: hidden by the tab when the shares total 0.
    val shares = BalanceAnalytics.categoryShares(spans, inputs.prevSpans, window, period.prevWindow)

    return PatternsModel(
        weekdayTotalMs = PatternsSelectors.weekdayTotal(weekdays),
        weekdays = weekdays,
        topWeekday = topWeekday,
        lede = Ledes.patterns(topWeekday, best?.daypart, fragmentation.medianBlockMs),
        fragmentation = fragmentation,
        deepWork = deepWork,
        dayparts = dayparts,
        bestDaypart = best,
        worstDaypart = worst,
        energy = energy,
        hasAttributes = PatternsSelectors.hasAttributes(deepWork, best, energy),
        heatmap = heatmap,
        bands = HeatmapSteps.bands(heatmap.cells),
        granularity = period.granularity,
        contextMix = BalanceAnalytics.categoryByBucket(spans, period.buckets, CONTEXT_MIX_TOP),
        shares = shares,
        sharesTotalMs = shares.sumOf { it.ms },
        satisfaction = CorrelationsAnalytics.satisfactionByCategory(spans, window),
    )
}

/** Series shown individually in the context-mix chart before folding into Other (balance-tab.tsx:56). */
private const val CONTEXT_MIX_TOP = 5
