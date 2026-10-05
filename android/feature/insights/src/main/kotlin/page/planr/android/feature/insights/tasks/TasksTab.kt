package page.planr.android.feature.insights.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.ZoneId
import page.planr.android.core.design.theme.COMPARISON_ALPHA
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.period.Periods
import page.planr.android.feature.insights.InsightsTab
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.TabEnv
import page.planr.android.feature.insights.model.TasksModel
import page.planr.android.feature.insights.model.resolve
import page.planr.android.feature.insights.ui.chart.BandInfo
import page.planr.android.feature.insights.ui.chart.BarChart
import page.planr.android.feature.insights.ui.chart.BarChartData
import page.planr.android.feature.insights.ui.chart.BarSeries
import page.planr.android.feature.insights.ui.chart.ChartHeights
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.PreviewSurface
import page.planr.android.feature.insights.ui.chart.TooltipRow
import page.planr.android.feature.insights.ui.components.ChartCard
import page.planr.android.feature.insights.ui.components.Footnote
import page.planr.android.feature.insights.ui.components.InsightsEmpty
import page.planr.android.feature.insights.ui.components.LeadFigure
import page.planr.android.feature.insights.ui.components.LedeRow
import page.planr.android.feature.insights.ui.components.LegendItem
import page.planr.android.feature.insights.ui.components.SeriesLegend
import page.planr.android.feature.insights.ui.components.StatFigure
import page.planr.android.feature.insights.ui.components.StatGrid
import page.planr.android.feature.insights.ui.components.rememberLabelLocale

/**
 * The Tasks tab (tasks-tab.tsx): the lede with completed / created / on-time
 * figures, overdue, done-of-created and lead time, and created vs completed
 * per bucket. A LazyColumn whose first item is always [header].
 */
@Composable
fun TasksTab(
    model: TasksModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    onOpenTasks: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val animationKey = Triple(InsightsTab.Tasks, env.window, model.granularity)
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        state = rememberLazyListState(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
    ) {
        item(key = "header") { header() }
        if (!model.hasTopLevel) {
            item(key = "empty") {
                InsightsEmpty(
                    title = stringResource(R.string.insights_tasks_empty_title),
                    description = stringResource(R.string.insights_tasks_empty_description),
                    actionLabel = stringResource(R.string.insights_tasks_open_tasks),
                    onAction = onOpenTasks,
                )
            }
            return@LazyColumn
        }
        item(key = "lede") { TasksLede(model) }
        item(key = "stats") { TaskStatGrid(model) }
        item(key = "velocity") { VelocityCard(model, env, animationKey) }
    }
}

/** The answer sentence, with completed, created and on-time as lead figures. */
@Composable
private fun TasksLede(model: TasksModel) {
    val stats = model.stats
    // Attention (overdue) carries the attention icon and the spoken prefix (LedeRow).
    LedeRow(
        tone = model.lede.tone,
        headline = ledeText(model.lede.headline),
        support = model.lede.support?.let { ledeText(it) },
        figures = listOf(
            LeadFigure(stringResource(R.string.insights_tasks_lead_completed), stats.completedCount.toString()),
            LeadFigure(stringResource(R.string.insights_tasks_lead_created), stats.createdCount.toString()),
            LeadFigure(
                stringResource(R.string.insights_tasks_lead_on_time),
                TasksText.percent(stats.adherenceRate),
                hint = TasksText.onTimeHint(stats.dueCount).resolve(),
            ),
        ),
    )
}

/** Overdue (a warning when any), done of created and the median lead time, then the top-level note. */
@Composable
private fun TaskStatGrid(model: TasksModel) {
    val stats = model.stats
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        StatGrid {
            StatFigure(
                label = stringResource(R.string.insights_tasks_overdue),
                value = stats.overdueOpenCount.toString(),
                hint = stringResource(R.string.insights_tasks_overdue_hint),
                warning = stats.overdueOpenCount > 0,
            )
            StatFigure(
                label = stringResource(R.string.insights_tasks_done_of_created),
                value = TasksText.percent(stats.completionRate),
                hint = stringResource(R.string.insights_tasks_done_of_created_hint),
            )
            StatFigure(
                label = stringResource(R.string.insights_tasks_lead_time),
                value = leadTimeText(model.leadTime),
                hint = stringResource(R.string.insights_tasks_lead_time_hint),
            )
        }
        Footnote(stringResource(R.string.insights_tasks_top_level_note))
    }
}

/**
 * Completed vs created per bucket. Completed is the focal warm stone, never
 * the web's teal (§H.32); Created is the lighter comparison fill, placed second
 * in each group. Values are counts.
 */
@Composable
private fun VelocityCard(model: TasksModel, env: TabEnv, animationKey: Any) {
    val g = model.granularity
    val zone = env.zone
    val locale = rememberLabelLocale()
    val chart = PlanrTheme.colors.chart
    val completedLabel = stringResource(R.string.insights_tasks_series_completed)
    val createdLabel = stringResource(R.string.insights_tasks_series_created)

    val ticks = remember(model, zone, locale) { model.velocity.map { InsightsLabels.bucketTick(it.start, g, zone, locale) } }
    val data = remember(model, ticks, chart) {
        BarChartData(
            series = listOf(
                BarSeries("completed", model.velocity.map { it.completed.toLong() }, chart.series[0]),
                BarSeries("created", model.velocity.map { it.created.toLong() }, chart.neutral, alpha = COMPARISON_ALPHA),
            ),
            primary = 0,
            ticks = ticks,
        )
    }
    val bands = remember(model, zone, locale, chart, completedLabel, createdLabel) {
        model.velocity.map { v ->
            BandInfo(
                InsightsLabels.bucketLabel(MsWindow(v.start, v.end), g, zone, locale),
                listOf(
                    TooltipRow(chart.series[0], completedLabel, v.completed.toString()),
                    TooltipRow(chart.comparison, createdLabel, v.created.toString()),
                ),
            )
        }
    }
    val legend = remember(chart, completedLabel, createdLabel) {
        listOf(
            LegendItem("completed", completedLabel, chart.series[0]),
            LegendItem("created", createdLabel, chart.comparison),
        )
    }
    val stats = model.stats
    val description = stringResource(TasksText.velocityAria(g), env.periodLabel) + ". " +
        stringResource(
            R.string.insights_tasks_sr_summary,
            stats.completedCount,
            stats.createdCount,
            env.periodLabel,
            stats.overdueOpenCount,
        )

    ChartCard(title = stringResource(TasksText.velocityTitle(g))) {
        Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
            // A tap shows the bucket's tooltip; velocity bars do not open a day.
            BarChart(
                data = data,
                contentDescription = description,
                bands = bands,
                animationKey = animationKey,
                height = ChartHeights.Compact,
            )
            SeriesLegend(legend)
        }
    }
}

// --- Preview -----------------------------------------------------------------------

@InsightsPreviews
@Preview(name = "Light ru", showBackground = true, backgroundColor = 0xFFFAF8F5, widthDp = 360, locale = "ru")
@Preview(
    name = "Dark ru",
    showBackground = true,
    backgroundColor = 0xFF1C1917,
    widthDp = 360,
    locale = "ru",
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES or android.content.res.Configuration.UI_MODE_TYPE_NORMAL,
)
@Composable
private fun TasksTabPreview() = PreviewSurface {
    val sample = remember { TasksPreviewData.sample() }
    TasksTab(model = sample.model, env = sample.env, header = {}, onOpenTasks = {})
}

/** Two weeks of tasks with a couple overdue, built through the real builder. */
private object TasksPreviewData {
    class Sample(val model: TasksModel, val env: TabEnv)

    private const val HOUR = 3_600_000L
    private const val DAY = 24 * HOUR

    fun sample(): Sample {
        val zone = ZoneId.of("Europe/Berlin")
        val now = LocalDate.of(2026, 6, 24).atTime(12, 0).atZone(zone).toInstant().toEpochMilli()
        val state = PeriodState(preset = PeriodPreset.Last30d)
        val period = Periods.resolve(state, zone, now)
        val start = period.window.start
        val tasks = (0 until 40).map { i ->
            val created = start - 10 * DAY + i * 22 * HOUR
            val done = i % 3 != 0
            previewTask(
                id = "t$i",
                createdAt = created,
                completedAt = if (done) created + (6 + (i * 13) % 70) * HOUR else null,
                due = if (i % 4 == 0) LocalDate.of(2026, 6, 1).plusDays((i % 30).toLong()) else null,
            )
        } + previewTask("sub", createdAt = start, completedAt = null, due = null, parentId = "t1")
        val inputs = InsightsInputs(
            viewerId = "me",
            zone = zone,
            now = now,
            state = state,
            period = period,
            spans = emptyList(),
            prevSpans = emptyList(),
            tasks = tasks,
            categories = linkedMapOf(),
        )
        val env = TabEnv(
            zone = zone,
            categories = inputs.categories,
            preset = state.preset,
            periodLabel = "Last 30 days · 26 May – 24 Jun 2026",
            now = now,
            window = period.window,
        )
        return Sample(buildTasksModel(inputs), env)
    }

    private fun previewTask(id: String, createdAt: Long, completedAt: Long?, due: LocalDate?, parentId: String? = null) =
        InsightTask(
            id = id,
            title = id,
            parentId = parentId,
            collectionId = null,
            ownerId = "me",
            assigneeId = null,
            createdAt = createdAt,
            completedAt = completedAt,
            dueDate = due,
        )
}
