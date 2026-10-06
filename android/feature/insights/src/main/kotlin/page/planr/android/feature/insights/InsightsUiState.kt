package page.planr.android.feature.insights

import java.time.LocalDate
import java.time.ZoneId
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.model.Category
import page.planr.android.feature.insights.model.OverviewModel
import page.planr.android.feature.insights.model.PatternsModel
import page.planr.android.feature.insights.model.TasksModel
import page.planr.android.feature.insights.model.TrendsModel

/**
 * The tabs, in display order. Sleep is the viewer's own nights only; it has
 * its own ViewModel and ignores the period and the filters.
 */
enum class InsightsTab { Overview, Trends, Patterns, Tasks, Sleep }

/** The resolved period as the period bar shows it. */
data class PeriodUi(
    val preset: PeriodPreset,
    val requestedGranularity: Granularity,
    /** The effective granularity. */
    val granularity: Granularity,
    /** Periods.granularityChoices(window); the others are disabled. */
    val choices: List<Granularity>,
    val window: MsWindow,
    /** First and last day of the window in the viewer's zone. */
    val firstDay: LocalDate,
    val lastDay: LocalDate,
    /** A custom range was clamped to the most recent 366 days. */
    val clamped: Boolean,
)

data class FilterCategory(val id: String, val name: String, val color: String, val hidden: Boolean)

data class FiltersUi(val categories: List<FilterCategory>, val includeInactive: Boolean) {
    /** The filter trigger's badge (insights-filters-popover). */
    val activeCount: Int get() = categories.count { it.hidden } + if (includeInactive) 1 else 0
}

/** What the content area shows. */
sealed interface TabContent {
    data object Loading : TabContent

    /** The first load failed and nothing is cached. */
    data class Failed(val retryable: Boolean = true) : TabContent

    data class Overview(val model: OverviewModel) : TabContent

    data class Trends(val model: TrendsModel) : TabContent

    data class Patterns(val model: PatternsModel) : TabContent

    data class Tasks(val model: TasksModel) : TabContent

    /** Drawn by the Sleep tab's own ViewModel (SleepNightsViewModel). */
    data object Sleep : TabContent
}

data class InsightsUiState(
    val tab: InsightsTab = InsightsTab.Overview,
    /** Null until the viewer and their zone are known. */
    val period: PeriodUi? = null,
    val zone: ZoneId? = null,
    val now: Long = 0L,
    val filters: FiltersUi = FiltersUi(emptyList(), false),
    val content: TabContent = TabContent.Loading,
    /** A user-initiated refresh is in flight (pull-to-refresh indicator). */
    val isRefreshing: Boolean = false,
    /** The last refresh failed while cached content is shown: an inline banner. */
    val refreshFailed: Boolean = false,
    /** Overview's previous-period ghost (session only). */
    val showComparison: Boolean = false,
    /** Trends by-context series hidden from the legend (session only). */
    val hiddenTrendSeries: Set<String> = emptySet(),
    val dayDetail: DayDetailModel? = null,
    val categories: Map<String, Category> = emptyMap(),
)
