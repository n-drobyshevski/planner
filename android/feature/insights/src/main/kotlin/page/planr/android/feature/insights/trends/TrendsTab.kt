package page.planr.android.feature.insights.trends

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.ZoneId
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.period.Periods
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventKind
import page.planr.android.feature.insights.InsightsTab
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.TabEnv
import page.planr.android.feature.insights.model.TrendsModel
import page.planr.android.feature.insights.model.resolve
import page.planr.android.feature.insights.ui.chart.BandInfo
import page.planr.android.feature.insights.ui.chart.BarChart
import page.planr.android.feature.insights.ui.chart.BarChartData
import page.planr.android.feature.insights.ui.chart.BarSeries
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.LineChart
import page.planr.android.feature.insights.ui.chart.LineOverlay
import page.planr.android.feature.insights.ui.chart.LineSeries
import page.planr.android.feature.insights.ui.chart.PreviewSurface
import page.planr.android.feature.insights.ui.chart.TooltipRow
import page.planr.android.feature.insights.ui.components.ChartCard
import page.planr.android.feature.insights.ui.components.InsightsEmpty
import page.planr.android.feature.insights.ui.components.LeadFigure
import page.planr.android.feature.insights.ui.components.LedeRow
import page.planr.android.feature.insights.ui.components.LegendItem
import page.planr.android.feature.insights.ui.components.SectionLabel
import page.planr.android.feature.insights.ui.components.SeriesLegend
import page.planr.android.feature.insights.ui.components.durationText
import page.planr.android.feature.insights.ui.components.rememberLabelLocale
import page.planr.android.feature.insights.ui.components.seriesColor
import page.planr.android.feature.insights.ui.components.seriesName

/**
 * The Trends tab (trends-tab.tsx): the lede with total and busiest bucket,
 * tracked time per bucket (with the 7-day average and unusual days at day
 * granularity), Momentum, and the top contexts over time. A LazyColumn whose
 * first item is always [header].
 */
@Composable
fun TrendsTab(
    model: TrendsModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    hiddenSeries: Set<String>,
    onToggleSeries: (String) -> Unit,
    onOpenDay: (Long) -> Unit,
    onOpenAgenda: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val animationKey = Triple(InsightsTab.Trends, env.window, model.granularity)
    val busiest = model.busiest
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        state = rememberLazyListState(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
    ) {
        item(key = "header") { header() }
        // A non-zero total implies a busiest bucket; both guard the empty state.
        if (model.totalMs == 0L || busiest == null) {
            item(key = "empty") {
                InsightsEmpty(
                    title = stringResource(R.string.insights_trends_empty_title),
                    description = stringResource(R.string.insights_trends_empty_description),
                    actionLabel = stringResource(R.string.insights_common_empty_open_calendar),
                    onAction = onOpenAgenda,
                )
            }
            return@LazyColumn
        }
        item(key = "lede") { TrendsLede(model, env) }
        item(key = "per-bucket") { PerBucketCard(model, env, animationKey, onOpenDay) }
        if (model.showMomentum) item(key = "momentum") { Momentum(model, env) }
        if (model.byContext.seriesKeys.isNotEmpty()) {
            item(key = "by-context") { ByContextCard(model, env, hiddenSeries, onToggleSeries, animationKey) }
        }
    }
}

/** The answer sentence, with the total and the busiest bucket as lead figures. */
@Composable
private fun TrendsLede(model: TrendsModel, env: TabEnv) {
    val busiest = checkNotNull(model.busiest)
    val locale = rememberLabelLocale()
    val busiestLabel = remember(busiest, model.granularity, env.zone, locale) {
        InsightsLabels.bucketLabel(MsWindow(busiest.start, busiest.end), model.granularity, env.zone, locale)
    }
    LedeRow(
        tone = model.lede.tone,
        headline = ledeText(model.lede.headline, env.zone),
        support = model.lede.support?.let { ledeText(it, env.zone) },
        figures = listOf(
            LeadFigure(stringResource(R.string.insights_trends_total_tracked), durationText(model.totalMs.toDouble())),
            LeadFigure(stringResource(TrendsText.busiest(model.granularity)), durationText(busiest.ms.toDouble()), busiestLabel),
        ),
    )
}

/**
 * Tracked time per bucket. At day granularity the 7-day average overlays the
 * bars in the identity-free `chart.line` (the web's chart-2 is Member B's teal,
 * §H.32), unusual days get a hollow circle, and a tap opens the day.
 */
@Composable
private fun PerBucketCard(model: TrendsModel, env: TabEnv, animationKey: Any, onOpenDay: (Long) -> Unit) {
    val g = model.granularity
    val busiest = checkNotNull(model.busiest)
    val zone = env.zone
    val locale = rememberLabelLocale()
    val chart = PlanrTheme.colors.chart
    val trackedLabel = stringResource(R.string.insights_trends_series_tracked)
    val avgLabel = stringResource(R.string.insights_trends_series_avg)

    val labels = remember(model, zone, locale) {
        model.buckets.map { InsightsLabels.bucketLabel(MsWindow(it.start, it.end), g, zone, locale) }
    }
    val data = remember(model, zone, locale, chart) {
        val anomalyDays = model.anomalies.mapTo(HashSet()) { it.dayMs }
        BarChartData(
            series = listOf(BarSeries("ms", model.buckets.map { it.ms }, chart.series[0])),
            primary = 0,
            lines = model.rolling?.let { listOf(LineOverlay("avg", it.map { p -> p.avgMs }, chart.line)) }.orEmpty(),
            markers = model.buckets.indices.filterTo(HashSet()) { model.buckets[it].start in anomalyDays },
            ticks = model.buckets.map { InsightsLabels.bucketTick(it.start, g, zone, locale) },
        )
    }
    val bands = remember(model, labels, locale, chart, trackedLabel, avgLabel) {
        model.buckets.mapIndexed { i, b ->
            val tracked = TooltipRow(chart.series[0], trackedLabel, DurationFormat.format(b.ms.toDouble(), locale))
            val avg = model.rolling?.getOrNull(i)?.let { TooltipRow(chart.line, avgLabel, DurationFormat.format(it.avgMs, locale)) }
            BandInfo(labels[i], listOfNotNull(tracked, avg))
        }
    }

    val busiestLabel = labels[model.buckets.indexOf(busiest)]
    val busiestMs = durationText(busiest.ms.toDouble())
    val clause = TrendsText.trendClause(model.trend.direction)?.let { stringResource(it) }.orEmpty()
    val footnote = listOfNotNull(
        if (g == Granularity.Day) stringResource(R.string.insights_trends_footnote_avg) else null,
        if (model.anomalies.isNotEmpty()) stringResource(R.string.insights_trends_footnote_unusual) else null,
    ).joinToString(" · ").ifEmpty { null }
    val description = stringResource(TrendsText.perBucketAria(g), env.periodLabel) + ". " +
        stringResource(
            TrendsText.srSummary(g),
            durationText(model.totalMs.toDouble()),
            model.buckets.size,
            busiestLabel,
            busiestMs,
        )

    ChartCard(
        title = stringResource(TrendsText.perBucketTitle(g)),
        headline = stringResource(TrendsText.perBucketHeadline(g), busiestLabel, busiestMs, clause),
        footnote = footnote,
    ) {
        // Week and month bars show their tooltip on tap; only day bars open a day.
        val dayTap: ((Int) -> Unit)? = if (g == Granularity.Day) {
            { i -> onOpenDay(model.buckets[i].start) }
        } else {
            null
        }
        BarChart(
            data = data,
            contentDescription = description,
            bands = bands,
            animationKey = animationKey,
            onOpen = dayTap,
            openLabel = if (dayTap != null) stringResource(R.string.insights_common_open_day_action) else null,
        )
    }
}

/**
 * Momentum (day granularity only): streaks as plain figures (no flames, no
 * celebration, DESIGN.md), consistency, the trend rate, then unusual days as
 * quiet pills whose words, not a color, say heavy or light.
 */
@Composable
private fun Momentum(model: TrendsModel, env: TabEnv) {
    val locale = rememberLabelLocale()
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_trends_momentum))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            model.streak?.let { streak ->
                Figure(stringResource(R.string.insights_trends_current_streak), TrendsText.days(streak.current).resolve())
                Figure(stringResource(R.string.insights_trends_longest_streak), TrendsText.days(streak.longest).resolve())
            }
            model.consistency?.let { Figure(stringResource(R.string.insights_trends_consistency), TrendsText.percent(it)) }
            TrendsText.trendRate(model.trend, locale)?.let {
                Figure(stringResource(R.string.insights_trends_trend_rate), it.resolve())
            }
        }
        if (model.anomalies.isNotEmpty()) {
            val days = remember(model.anomalies, env.zone, locale) {
                model.anomalies.map { InsightsLabels.weekdayDayMonth(it.dayMs, env.zone, locale) }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                model.anomalies.forEachIndexed { i, a ->
                    AnomalyPill(
                        lead = stringResource(TrendsText.unusual(a.direction)),
                        day = days[i],
                        duration = DurationFormat.format(a.ms.toDouble(), locale),
                    )
                }
            }
        }
    }
}

/** tab-bits.tsx `Figure`: a label over a tabular value. */
@Composable
private fun Figure(label: String, value: String) {
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = TABULAR_NUMS),
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** A non-interactive pill: "Unusually heavy:", the day, its duration. */
@Composable
private fun AnomalyPill(lead: String, day: String, duration: String) {
    Surface(
        modifier = Modifier.semantics(mergeDescendants = true) {},
        shape = CircleShape,
        color = PlanrTheme.colors.card,
        border = BorderStroke(1.dp, PlanrTheme.colors.hairline),
    ) {
        Row(
            Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val style = MaterialTheme.typography.labelSmall
            Text(lead, style = style, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(day, style = style, color = MaterialTheme.colorScheme.onSurface)
            Text(
                duration,
                style = style.copy(fontFeatureSettings = TABULAR_NUMS),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * The top contexts over time, one line each, with a toggleable legend (the
 * hidden set is session state from the ViewModel) and the totals behind the
 * collapsed "View as table".
 */
@Composable
private fun ByContextCard(
    model: TrendsModel,
    env: TabEnv,
    hiddenSeries: Set<String>,
    onToggleSeries: (String) -> Unit,
    animationKey: Any,
) {
    val g = model.granularity
    val zone = env.zone
    val locale = rememberLabelLocale()
    val keys = model.byContext.seriesKeys
    val names = keys.map { seriesName(it, env.categories) }
    val colors = keys.map { seriesColor(it, env.categories) }

    val series = remember(model, names, colors) {
        keys.mapIndexed { i, key ->
            LineSeries(key, names[i], model.byContext.rows.map { it.byKey[key] ?: 0L }, colors[i])
        }
    }
    val ticks = remember(model, zone, locale) {
        model.byContext.rows.map { InsightsLabels.bucketTick(it.start, g, zone, locale) }
    }
    // Bands list the visible series only, in series order, like the chart's yMax.
    val bands = remember(model, names, colors, hiddenSeries, zone, locale) {
        model.byContext.rows.map { row ->
            BandInfo(
                InsightsLabels.bucketLabel(MsWindow(row.start, row.end), g, zone, locale),
                keys.indices.filter { keys[it] !in hiddenSeries }.map { i ->
                    TooltipRow(colors[i], names[i], DurationFormat.format((row.byKey[keys[i]] ?: 0L).toDouble(), locale))
                },
            )
        }
    }
    val legend = remember(names, colors) { keys.mapIndexed { i, key -> LegendItem(key, names[i], colors[i]) } }

    val top = model.topCategoryKey
    val headline = if (top != null) {
        val topMs = model.categoryTotals[top] ?: 0L
        stringResource(
            R.string.insights_trends_by_context_headline,
            names[keys.indexOf(top)],
            durationText(topMs.toDouble()),
            TrendsText.share(topMs, model.totalMs),
        )
    } else {
        null
    }

    ChartCard(
        title = stringResource(R.string.insights_trends_by_context_title),
        headline = headline,
        table = { ContextTable(model, names, colors, locale = locale) },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
            LineChart(
                series = series,
                hidden = hiddenSeries,
                ticks = ticks,
                contentDescription = stringResource(TrendsText.byContextAria(g), minOf(TOP_SERIES, keys.size)),
                bands = bands,
                animationKey = animationKey,
            )
            SeriesLegend(legend, hidden = hiddenSeries, onToggle = onToggleSeries)
        }
    }
}

/** One row per series: swatch and name, total time, share of all tracked time. */
@Composable
private fun ContextTable(
    model: TrendsModel,
    names: List<String>,
    colors: List<Color>,
    locale: LabelLocale,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val head = MaterialTheme.typography.labelSmall
    val figure = PlanrTheme.type.timeMedium
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.insights_trends_col_context), Modifier.weight(1f), style = head, color = muted)
            Text(stringResource(R.string.insights_trends_col_time), style = head, color = muted, textAlign = TextAlign.End)
            Text(
                stringResource(R.string.insights_trends_col_share),
                Modifier.width(SHARE_COLUMN),
                style = head,
                color = muted,
                textAlign = TextAlign.End,
            )
        }
        model.byContext.seriesKeys.forEachIndexed { i, key ->
            val ms = model.categoryTotals[key] ?: 0L
            HorizontalDivider(color = PlanrTheme.colors.hairline)
            Row(
                Modifier
                    .padding(vertical = 6.dp)
                    .semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(10.dp)
                            .background(colors[i], RoundedCornerShape(3.dp)),
                    )
                    Text(
                        names[i],
                        Modifier.padding(start = 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(DurationFormat.format(ms.toDouble(), locale), style = figure)
                Text(
                    TrendsText.share(ms, model.totalMs),
                    Modifier.width(SHARE_COLUMN),
                    style = figure,
                    color = muted,
                    textAlign = TextAlign.End,
                )
            }
        }
    }
}

/** The share column fits "100%" in the figure face. */
private val SHARE_COLUMN = 48.dp

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
private fun TrendsTabPreview() = PreviewSurface {
    val sample = remember { TrendsPreviewData.sample() }
    TrendsTab(
        model = sample.model,
        env = sample.env,
        header = {},
        hiddenSeries = emptySet(),
        onToggleSeries = {},
        onOpenDay = {},
        onOpenAgenda = {},
    )
}

/** A month of work, home and uncategorized blocks, built through the real builder. */
private object TrendsPreviewData {
    class Sample(val model: TrendsModel, val env: TabEnv)

    private const val HOUR = 3_600_000L

    fun sample(): Sample {
        val zone = ZoneId.of("Europe/Berlin")
        val now = LocalDate.of(2026, 6, 24).atTime(12, 0).atZone(zone).toInstant().toEpochMilli()
        val state = PeriodState(preset = PeriodPreset.Last30d)
        val period = Periods.resolve(state, zone, now)
        val categories = linkedMapOf(
            "work" to Category(id = "work", workspaceId = "ws", ownerId = "me", name = "Work", color = "#2a77b8"),
            "home" to Category(id = "home", workspaceId = "ws", ownerId = null, name = "Home", color = "#b45309"),
        )
        val spans = period.days.flatMapIndexed { i, day ->
            val work = (2 + i % 5 + if (i == 17) 7 else 0) * HOUR
            listOf(
                previewSpan("w$i", day + 9 * HOUR, work, "work"),
                previewSpan("h$i", day + 19 * HOUR, (i % 3) * HOUR, "home"),
                previewSpan("n$i", day + 7 * HOUR, (i % 2) * HOUR / 2, null),
            ).filter { it.end > it.start }
        }
        val inputs = InsightsInputs(
            viewerId = "me",
            zone = zone,
            now = now,
            state = state,
            period = period,
            spans = spans,
            prevSpans = emptyList(),
            tasks = emptyList(),
            categories = categories,
        )
        val env = TabEnv(
            zone = zone,
            categories = categories,
            preset = state.preset,
            periodLabel = "Last 30 days · 26 May – 24 Jun 2026",
            now = now,
            window = period.window,
        )
        return Sample(buildTrendsModel(inputs), env)
    }

    private fun previewSpan(key: String, start: Long, ms: Long, categoryId: String?) = Span(
        key = key,
        eventId = key,
        title = key,
        start = start,
        end = start + ms,
        kind = EventKind.Event,
        allDay = false,
        inactive = false,
        ownerId = "me",
        isShared = false,
        categoryId = categoryId,
        attributes = Attributes.None,
    )
}
