package page.planr.android.feature.insights.overview

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.COMPARISON_ALPHA
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.Delta
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.LedeTone
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PerDayPoint
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.ShareRow
import page.planr.android.core.insights.model.ShareRowId
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.TotalTrend
import page.planr.android.core.insights.selectors.OverviewSelectors
import page.planr.android.core.model.Category
import page.planr.android.feature.insights.InsightsTab
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.OverviewLead
import page.planr.android.feature.insights.model.OverviewModel
import page.planr.android.feature.insights.model.OverviewStat
import page.planr.android.feature.insights.model.TabEnv
import page.planr.android.feature.insights.model.UiText
import page.planr.android.feature.insights.model.resolve
import page.planr.android.feature.insights.ui.chart.BandInfo
import page.planr.android.feature.insights.ui.chart.BarChart
import page.planr.android.feature.insights.ui.chart.BarChartData
import page.planr.android.feature.insights.ui.chart.BarSeries
import page.planr.android.feature.insights.ui.chart.ChartHeights
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.LineOverlay
import page.planr.android.feature.insights.ui.chart.PreviewSurface
import page.planr.android.feature.insights.ui.chart.ShareBar
import page.planr.android.feature.insights.ui.chart.ShareSegment
import page.planr.android.feature.insights.ui.chart.TooltipRow
import page.planr.android.feature.insights.ui.components.ChartCard
import page.planr.android.feature.insights.ui.components.InsightsEmpty
import page.planr.android.feature.insights.ui.components.LeadFigure
import page.planr.android.feature.insights.ui.components.LedeRow
import page.planr.android.feature.insights.ui.components.SectionHeadline
import page.planr.android.feature.insights.ui.components.SectionLabel
import page.planr.android.feature.insights.ui.components.StatFigure
import page.planr.android.feature.insights.ui.components.StatGrid
import page.planr.android.feature.insights.ui.components.durationText
import page.planr.android.feature.insights.ui.components.rememberGlyphText
import page.planr.android.feature.insights.ui.components.rememberLabelLocale
import page.planr.android.feature.insights.ui.components.seriesColor
import page.planr.android.feature.insights.ui.components.seriesName

/**
 * The Overview tab (overview-tab.tsx): the lede and its lead figures, six
 * stat figures, the per-day chart, the context split and the share shifts.
 * A LazyColumn whose first item is always [header].
 */
@Composable
fun OverviewTab(
    model: OverviewModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    showComparison: Boolean,
    onToggleComparison: () -> Unit,
    onOpenDay: (Long) -> Unit,
    onOpenAgenda: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        state = rememberLazyListState(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
    ) {
        item(key = "header") { header() }
        if (model.totalMs == 0L) {
            item(key = "empty") {
                InsightsEmpty(
                    title = stringResource(R.string.insights_common_empty_title),
                    description = stringResource(R.string.insights_common_empty_description),
                    actionLabel = stringResource(R.string.insights_common_empty_open_calendar),
                    onAction = onOpenAgenda,
                )
            }
            return@LazyColumn
        }
        model.lede?.let { lede -> item(key = "lede") { OverviewLede(lede, model.lead, env.categories) } }
        item(key = "stats") { OverviewStats(model.stats, env) }
        item(key = "per-day") { PerDayCard(model, env, showComparison, onToggleComparison, onOpenDay) }
        item(key = "by-context") { ByContext(model.shares, model.totalMs, env.categories) }
        if (model.shifts.isNotEmpty()) item(key = "shifts") { Shifts(model.shifts, env.categories) }
    }
}

/** The answer sentence with Total, Daily avg and Active days under it. */
@Composable
private fun OverviewLede(lede: Lede, lead: OverviewLead, categories: Map<String, Category>) {
    LedeRow(
        tone = lede.tone,
        headline = ledeText(lede.headline, categories),
        support = lede.support?.let { ledeText(it, categories) },
        figures = listOf(
            LeadFigure(stringResource(R.string.insights_overview_lead_total), durationText(lead.totalMs.toDouble())),
            LeadFigure(stringResource(R.string.insights_overview_lead_daily_avg), durationText(lead.dailyAvgMs)),
            LeadFigure(stringResource(R.string.insights_overview_lead_active_days), "${lead.activeDays}/${lead.dayCount}"),
        ),
    )
}

/** The six flat figures, in the dashboard registry's order. */
@Composable
private fun OverviewStats(stats: List<OverviewStat>, env: TabEnv) {
    val locale = rememberLabelLocale()
    StatGrid {
        for (stat in stats) {
            when (stat) {
                is OverviewStat.Events -> StatFigure(
                    label = stringResource(R.string.insights_overview_events),
                    value = stat.count.toString(),
                    hint = stringResource(R.string.insights_overview_events_hint),
                    delta = stat.delta,
                )
                is OverviewStat.AvgSession -> StatFigure(
                    label = stringResource(R.string.insights_overview_avg_session),
                    value = stat.ms?.let { durationText(it) } ?: DASH,
                    hint = stringResource(R.string.insights_overview_avg_session_hint),
                )
                is OverviewStat.BusiestDay -> StatFigure(
                    label = stringResource(R.string.insights_overview_busiest_day),
                    value = stat.day?.let { durationText(it.ms.toDouble()) } ?: DASH,
                    hint = stat.day?.let { InsightsLabels.weekdayDayMonthNoComma(it.dayMs, env.zone, locale) },
                )
                is OverviewStat.TasksDone -> StatFigure(
                    label = stringResource(R.string.insights_overview_tasks_done),
                    value = stat.count.toString(),
                    delta = stat.delta,
                )
                is OverviewStat.OnTime -> StatFigure(
                    label = stringResource(R.string.insights_overview_on_time),
                    value = onTimeValue(stat.rate),
                    hint = onTimeHint(stat.dueCount).resolve(),
                )
                is OverviewStat.Overdue -> StatFigure(
                    label = stringResource(R.string.insights_overview_overdue),
                    value = stat.count.toString(),
                    hint = stringResource(R.string.insights_overview_overdue_hint),
                    warning = stat.count > 0,
                )
            }
        }
    }
}

/** Tracked time per day, its 7-day average, the typical day and (on request) the previous period. */
@Composable
private fun PerDayCard(
    model: OverviewModel,
    env: TabEnv,
    showComparison: Boolean,
    onToggleComparison: () -> Unit,
    onOpenDay: (Long) -> Unit,
) {
    val chart = PlanrTheme.colors.chart
    val locale = rememberLabelLocale()
    val total = durationText(model.totalMs.toDouble())
    val tracked = stringResource(R.string.insights_overview_series_tracked)
    val average = stringResource(R.string.insights_overview_series_avg)
    val previous = stringResource(R.string.insights_overview_series_prev)

    val data = remember(model.perDay, model.typicalDayMs, showComparison, chart, env.zone, locale) {
        val main = BarSeries("ms", model.perDay.map { it.ms }, chart.series[0])
        // The ghost sits left of the bar it compares with (overview-tab.tsx:404-421).
        val ghost = BarSeries("prev", model.perDay.map { it.prevMs ?: 0L }, chart.neutral, alpha = COMPARISON_ALPHA)
        BarChartData(
            series = if (showComparison) listOf(ghost, main) else listOf(main),
            // The web's chart-2 is Member B's teal; the average carries no identity here.
            lines = listOf(LineOverlay("avg", model.perDay.map { it.avgMs }, chart.line)),
            referenceY = model.typicalDayMs.takeIf { it > 0 },
            ticks = model.perDay.map { InsightsLabels.bucketTick(it.dayMs, Granularity.Day, env.zone, locale) },
        )
    }
    val bands = remember(model.perDay, showComparison, chart, env.zone, locale, tracked, average, previous) {
        model.perDay.map { p ->
            BandInfo(
                title = InsightsLabels.weekdayDayMonth(p.dayMs, env.zone, locale),
                rows = listOfNotNull(
                    TooltipRow(chart.series[0], tracked, DurationFormat.format(p.ms.toDouble(), locale)),
                    TooltipRow(chart.line, average, DurationFormat.format(p.avgMs, locale)),
                    p.prevMs?.takeIf { showComparison }?.let {
                        TooltipRow(chart.comparison, previous, DurationFormat.format(it.toDouble(), locale))
                    },
                ),
            )
        }
    }
    val busiest = model.busiestDay?.let {
        InsightsLabels.weekdayDayMonthWide(it.dayMs, env.zone, locale) to durationText(it.ms.toDouble())
    }
    val topName = model.shares.firstOrNull()?.let { shareName(it, env.categories) }
    val open: (Int) -> Unit = remember(model.perDay, onOpenDay) {
        { i -> model.perDay.getOrNull(i)?.let { onOpenDay(it.dayMs) } }
    }
    val parts = perDayDescription(env.periodLabel, total, busiest, topName).map { it.resolve() }
    // The aria label, then the sr-only paragraph (whose later sentences carry their own leading space).
    val description = parts.first() + ". " + parts.drop(1).joinToString("")

    ChartCard(
        title = stringResource(R.string.insights_overview_per_day),
        headline = perDayHeadline(model.totalChange, total).resolve(),
        footnote = perDayFootnote(model.typicalDayMs, locale).resolve(),
    ) {
        // Under the headline rather than beside the title: the label does not fit next to it at 360 dp.
        FilterChip(
            selected = showComparison,
            onClick = onToggleComparison,
            label = { Text(stringResource(R.string.insights_common_compare_previous)) },
        )
        BarChart(
            data = data,
            contentDescription = description,
            bands = bands,
            animationKey = Triple(InsightsTab.Overview, env.window, Granularity.Day),
            height = ChartHeights.Compact,
            onOpen = open,
            openLabel = stringResource(R.string.insights_common_open_day_action),
        )
    }
}

/** The 100% share bar and its list: the text values are the data, the bar is decoration. */
@Composable
private fun ByContext(shares: List<ShareRow>, totalMs: Long, categories: Map<String, Category>) {
    val neutral = PlanrTheme.colors.chart.neutral
    val rows = shares.map { row ->
        val key = (row.id as? ShareRowId.Series)?.key
        ShareLine(
            key = key ?: OTHER_ROW,
            name = shareName(row, categories),
            color = if (key != null) seriesColor(key, categories) else neutral,
            ms = row.ms,
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg)) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            SectionLabel(stringResource(R.string.insights_overview_by_context))
            rows.firstOrNull()?.let { top ->
                val pct = percentText(top.ms, totalMs)
                SectionHeadline(stringResource(R.string.insights_overview_share_headline, top.name, pct))
            }
        }
        ShareBar(rows.map { ShareSegment(it.key, it.ms, it.color) })
        Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
            for (row in rows) ShareRowView(row, totalMs)
        }
    }
}

private data class ShareLine(val key: String, val name: String, val color: Color, val ms: Long)

@Composable
private fun ShareRowView(row: ShareLine, totalMs: Long) {
    val figure = PlanrTheme.type.timeMedium
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(10.dp)
                .background(row.color, RoundedCornerShape(3.dp)),
        )
        Text(
            row.name,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(durationText(row.ms.toDouble()), style = figure, color = muted)
        Text(
            percentText(row.ms, totalMs),
            modifier = Modifier.width(36.dp),
            style = figure,
            color = muted,
            textAlign = TextAlign.End,
        )
    }
}

/** Up to three contexts whose share moved by two points or more. */
@Composable
private fun Shifts(shifts: List<CategoryShare>, categories: Map<String, Category>) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_overview_shifts))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            for (shift in shifts) ShiftChip(shift, categories)
        }
    }
}

@Composable
private fun ShiftChip(shift: CategoryShare, categories: Map<String, Category>) {
    val key = SeriesKeys.of(shift.categoryId)
    val name = seriesName(key, categories)
    val points = OverviewSelectors.shiftPoints(shift.deltaShare)
    val (glyph, figure) = shiftFigure(points)
    val spoken = shiftSpoken(name, points).resolve()
    // Not interactive: an outlined pill on the card color, spoken as one sentence.
    Row(
        Modifier
            .border(1.dp, PlanrTheme.colors.hairline, CircleShape)
            .background(PlanrTheme.colors.card, CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp)
            .clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(8.dp)
                .background(seriesColor(key, categories), CircleShape),
        )
        Text(
            name,
            modifier = Modifier.widthIn(max = 128.dp),
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            rememberGlyphText(glyph + figure.resolve()),
            style = PlanrTheme.type.timeMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** A share row's name: its series, or the folded rest (overview.other). */
@Composable
private fun shareName(row: ShareRow, categories: Map<String, Category>): String = when (val id = row.id) {
    is ShareRowId.Series -> seriesName(id.key, categories)
    ShareRowId.Other -> stringResource(R.string.insights_overview_other)
}

/** The folded row's key in the share bar (never a category id). */
private const val OTHER_ROW = "other"

// --- Previews ----------------------------------------------------------------------

@Preview(name = "Light ru", locale = "ru", showBackground = true, backgroundColor = 0xFFFAF8F5, widthDp = 360)
@Preview(
    name = "Dark ru",
    locale = "ru",
    showBackground = true,
    backgroundColor = 0xFF1C1917,
    widthDp = 360,
    uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL,
)
private annotation class RuPreviews

@InsightsPreviews
@RuPreviews
@Composable
private fun OverviewTabPreview() = PreviewSurface {
    OverviewTab(
        model = OverviewPreview.model,
        env = OverviewPreview.env,
        header = {},
        showComparison = true,
        onToggleComparison = {},
        onOpenDay = {},
        onOpenAgenda = {},
    )
}

@InsightsPreviews
@Composable
private fun OverviewTabEmptyPreview() = PreviewSurface {
    OverviewTab(
        model = OverviewPreview.model.copy(totalMs = 0, lede = null),
        env = OverviewPreview.env,
        header = {},
        showComparison = false,
        onToggleComparison = {},
        onOpenDay = {},
        onOpenAgenda = {},
    )
}

/** A fixed week in Berlin: Work and Home, one shift each way. */
private object OverviewPreview {
    private const val HOUR = 3_600_000L
    private const val DAY = 24 * HOUR
    private val zone = java.time.ZoneId.of("Europe/Berlin")
    private val monday = java.time.LocalDate.of(2026, 9, 28).atStartOfDay(zone).toInstant().toEpochMilli()
    private val hours = listOf(3L, 5L, 0L, 7L, 4L, 2L, 6L)
    private val prevHours = listOf(2L, 4L, 3L, 5L, 5L, 1L, 0L)
    private val total = hours.sum() * HOUR

    private val work = Category(id = "work", workspaceId = "ws", ownerId = null, name = "Work", color = "#2a77b8")
    private val home = Category(id = "home", workspaceId = "ws", ownerId = null, name = "Home", color = "#b45309")

    val env = TabEnv(
        zone = zone,
        categories = linkedMapOf(work.id to work, home.id to home),
        preset = PeriodPreset.ThisWeek,
        periodLabel = "This week · 28 Sep – 4 Oct 2026",
        now = monday + 6 * DAY,
        window = MsWindow(monday, monday + 7 * DAY),
    )

    val model = OverviewModel(
        totalMs = total,
        lede = Lede(
            LedeTone.Neutral,
            LedeLine(
                "lede.overviewHeadline",
                linkedMapOf(
                    "total" to LedeArg.Duration(total.toDouble()),
                    "direction" to LedeArg.Select("up"),
                    "unit" to LedeArg.Select("week"),
                    "pct" to LedeArg.Num(35),
                    "magnitude" to LedeArg.Duration(7.0 * HOUR),
                ),
            ),
            LedeLine("lede.overviewSupport", linkedMapOf("name" to LedeArg.Category("work"), "pct" to LedeArg.Num(63))),
        ),
        lead = OverviewLead(total, total / 7.0, 6, 7),
        stats = listOf(
            OverviewStat.Events(14, Delta(2.0, 0.1667)),
            OverviewStat.AvgSession(total / 14.0),
            OverviewStat.BusiestDay(DayUsage(monday + 3 * DAY, 7 * HOUR)),
            OverviewStat.TasksDone(5, Delta(-1.0, -0.1667)),
            OverviewStat.OnTime(0.8, 5),
            OverviewStat.Overdue(2),
        ),
        perDay = hours.mapIndexed { i, h ->
            PerDayPoint(monday + i * DAY, h * HOUR, hours.take(i + 1).average() * HOUR, prevHours[i] * HOUR)
        },
        typicalDayMs = 4.0 * HOUR,
        totalChange = TotalChange(TotalTrend.Up, 35),
        shares = listOf(
            ShareRow(ShareRowId.Series("work"), 17 * HOUR),
            ShareRow(ShareRowId.Series("home"), 8 * HOUR),
            ShareRow(ShareRowId.Series(SeriesKeys.UNCATEGORIZED), 2 * HOUR),
        ),
        shifts = listOf(
            CategoryShare("work", 17 * HOUR, 0.63, 10 * HOUR, 0.5, 0.13),
            CategoryShare("home", 8 * HOUR, 0.3, 9 * HOUR, 0.45, -0.15),
        ),
        busiestDay = DayUsage(monday + 3 * DAY, 7 * HOUR),
    )
}
