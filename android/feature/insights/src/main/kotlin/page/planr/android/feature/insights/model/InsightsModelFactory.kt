package page.planr.android.feature.insights.model

import javax.inject.Inject
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.selectors.DayDetail
import page.planr.android.feature.insights.overview.buildOverviewModel
import page.planr.android.feature.insights.patterns.buildPatternsModel
import page.planr.android.feature.insights.tasks.buildTasksModel
import page.planr.android.feature.insights.trends.buildTrendsModel

/** Builds each tab's model from the inputs (pure; the ViewModel runs it off the main thread). */
interface InsightsModelFactory {
    fun overview(inputs: InsightsInputs): OverviewModel

    fun trends(inputs: InsightsInputs): TrendsModel

    fun patterns(inputs: InsightsInputs): PatternsModel

    fun tasks(inputs: InsightsInputs): TasksModel

    /** `Comparator<in String>`: java.text.Collator is a Comparator<Any?> and must be accepted as is. */
    fun dayDetail(inputs: InsightsInputs, dayMs: Long, titleOrder: Comparator<in String>): DayDetailModel
}

class DefaultInsightsModelFactory @Inject constructor() : InsightsModelFactory {
    override fun overview(inputs: InsightsInputs) = buildOverviewModel(inputs)

    override fun trends(inputs: InsightsInputs) = buildTrendsModel(inputs)

    override fun patterns(inputs: InsightsInputs) = buildPatternsModel(inputs)

    override fun tasks(inputs: InsightsInputs) = buildTasksModel(inputs)

    override fun dayDetail(inputs: InsightsInputs, dayMs: Long, titleOrder: Comparator<in String>) =
        DayDetail.build(dayMs, inputs.period, inputs.spans, inputs.zone, titleOrder)
}
