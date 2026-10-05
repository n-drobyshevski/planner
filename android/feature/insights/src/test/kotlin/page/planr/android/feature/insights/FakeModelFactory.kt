package page.planr.android.feature.insights

import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.model.DeepWorkShare
import page.planr.android.core.insights.model.EnergySummary
import page.planr.android.core.insights.model.Fragmentation
import page.planr.android.core.insights.model.HourHeatmap
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.LedeTone
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.TotalTrend
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.WeekdayUsage
import page.planr.android.core.insights.period.Periods
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.InsightsModelFactory
import page.planr.android.feature.insights.model.OverviewLead
import page.planr.android.feature.insights.model.OverviewModel
import page.planr.android.feature.insights.model.PatternsModel
import page.planr.android.feature.insights.model.TasksModel
import page.planr.android.feature.insights.model.TrendsModel

/**
 * Canned tab models that record what they were built from: the ViewModel
 * tests check the inputs (filters, slices, period) and how often a model is
 * computed, never the analytics themselves.
 */
class FakeModelFactory : InsightsModelFactory {

    /** Every tab build, in call order. */
    val calls = mutableListOf<Pair<InsightsTab, InsightsInputs>>()

    /** Every day-sheet build: its inputs and day. */
    val dayCalls = mutableListOf<Pair<InsightsInputs, Long>>()

    val lastInputs: InsightsInputs get() = calls.last().second

    override fun overview(inputs: InsightsInputs): OverviewModel {
        calls += InsightsTab.Overview to inputs
        val total = inputs.spans.sumOf { it.end - it.start }
        return OverviewModel(
            totalMs = total,
            lede = null,
            lead = OverviewLead(total, 0.0, 0, inputs.period.days.size),
            stats = emptyList(),
            perDay = emptyList(),
            typicalDayMs = 0.0,
            totalChange = TotalChange(TotalTrend.None, 0),
            shares = emptyList(),
            shifts = emptyList(),
            busiestDay = null,
        )
    }

    override fun trends(inputs: InsightsInputs): TrendsModel {
        calls += InsightsTab.Trends to inputs
        return TrendsModel(
            totalMs = inputs.spans.sumOf { it.end - it.start },
            granularity = inputs.period.granularity,
            buckets = emptyList(),
            busiest = null,
            trend = TrendDirection(null, null),
            lede = LEDE,
            rolling = null,
            anomalies = emptyList(),
            streak = null,
            consistency = null,
            showMomentum = false,
            byContext = CategoryBuckets(emptyList(), emptyList()),
            categoryTotals = emptyMap(),
            topCategoryKey = null,
        )
    }

    override fun patterns(inputs: InsightsInputs): PatternsModel {
        calls += InsightsTab.Patterns to inputs
        val monday = WeekdayUsage(weekday = 0, totalMs = 0, avgMs = 0.0, dayCount = 0)
        return PatternsModel(
            weekdayTotalMs = 0,
            weekdays = List(7) { monday.copy(weekday = it) },
            topWeekday = monday,
            lede = null,
            fragmentation = Fragmentation(0, null, null, null, null, null),
            deepWork = DeepWorkShare(0, 0, 0, null),
            dayparts = emptyList(),
            bestDaypart = null,
            worstDaypart = null,
            energy = EnergySummary(null, 0, 0, null),
            hasAttributes = false,
            heatmap = HourHeatmap(emptyList(), 0),
            bands = List(42) { 0L },
            granularity = inputs.period.granularity,
            contextMix = CategoryBuckets(emptyList(), emptyList()),
            shares = emptyList(),
            sharesTotalMs = 0,
            satisfaction = emptyList(),
        )
    }

    override fun tasks(inputs: InsightsInputs): TasksModel {
        calls += InsightsTab.Tasks to inputs
        val stats = TaskStats(0, 0, 0, null, 0, null, null)
        return TasksModel(
            hasTopLevel = inputs.tasks.isNotEmpty(),
            stats = stats,
            prevStats = stats,
            lede = LEDE,
            leadTime = null,
            granularity = inputs.period.granularity,
            velocity = emptyList(),
        )
    }

    override fun dayDetail(inputs: InsightsInputs, dayMs: Long, titleOrder: Comparator<in String>): DayDetailModel {
        dayCalls += inputs to dayMs
        val date = Periods.localDate(dayMs, inputs.zone)
        val end = date.plusDays(1).atStartOfDay(inputs.zone).toInstant().toEpochMilli()
        val items = inputs.spans.filter { it.start < end && it.end > dayMs }
        return DayDetailModel(dayMs, end, date, items, items.sumOf { it.end - it.start })
    }

    private companion object {
        val LEDE = Lede(LedeTone.Neutral, LedeLine("lede.test", emptyMap()), null)
    }
}
