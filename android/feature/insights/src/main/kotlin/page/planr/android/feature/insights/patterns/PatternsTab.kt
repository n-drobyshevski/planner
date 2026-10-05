package page.planr.android.feature.insights.patterns

import android.content.res.Configuration
import android.content.res.Resources
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.time.LocalDateTime
import java.time.ZoneId
import kotlin.math.abs
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.insights.analytics.CorrelationsAnalytics
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.DaypartRating
import page.planr.android.core.insights.model.Focus
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.period.Periods
import page.planr.android.core.insights.selectors.HeatmapSteps
import page.planr.android.core.insights.selectors.PatternsSelectors
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventKind
import page.planr.android.feature.insights.InsightsTab
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.PatternsModel
import page.planr.android.feature.insights.model.TabEnv
import page.planr.android.feature.insights.ui.chart.BandInfo
import page.planr.android.feature.insights.ui.chart.BarSeries
import page.planr.android.feature.insights.ui.chart.HBarRow
import page.planr.android.feature.insights.ui.chart.Heatmap
import page.planr.android.feature.insights.ui.chart.HeatmapData
import page.planr.android.feature.insights.ui.chart.HeatmapLegend
import page.planr.android.feature.insights.ui.chart.HorizontalBars
import page.planr.android.feature.insights.ui.chart.StackedBarChart
import page.planr.android.feature.insights.ui.chart.TooltipRow
import page.planr.android.feature.insights.ui.chart.TrackBar
import page.planr.android.feature.insights.ui.components.InsightsEmpty
import page.planr.android.feature.insights.ui.components.LeadFigure
import page.planr.android.feature.insights.ui.components.LedeRow
import page.planr.android.feature.insights.ui.components.LegendItem
import page.planr.android.feature.insights.ui.components.SectionEmpty
import page.planr.android.feature.insights.ui.components.SectionLabel
import page.planr.android.feature.insights.ui.components.SeriesLegend
import page.planr.android.feature.insights.ui.components.StatFigure
import page.planr.android.feature.insights.ui.components.StatGrid
import page.planr.android.feature.insights.ui.components.durationText
import page.planr.android.feature.insights.ui.components.rememberGlyphText
import page.planr.android.feature.insights.ui.components.rememberLabelLocale
import page.planr.android.feature.insights.ui.components.seriesColor
import page.planr.android.feature.insights.ui.components.seriesName

/** The Patterns tab: a LazyColumn whose first item is always [header]. */
@Composable
fun PatternsTab(
    model: PatternsModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    onOpenAgenda: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val animationKey = Triple(InsightsTab.Patterns, env.window, model.granularity)
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        state = rememberLazyListState(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
    ) {
        item(key = "header") { header() }
        if (model.weekdayTotalMs == 0L) {
            item(key = "empty") {
                InsightsEmpty(
                    title = stringResource(R.string.insights_patterns_empty_title),
                    description = stringResource(R.string.insights_patterns_empty_description),
                    actionLabel = stringResource(R.string.insights_common_empty_open_calendar),
                    onAction = onOpenAgenda,
                )
            }
            return@LazyColumn
        }
        model.lede?.let { lede -> item(key = "lede") { PatternsLede(model, lede) } }
        item(key = "weekdays") { WeekdaySection(model, env, animationKey) }
        item(key = "attributes") { AttributesSection(model, onOpenAgenda) }
        item(key = "heatmap") { HeatmapSection(model) }
        item(key = "fragmentation") { FragmentationSection(model) }
        // Second half: how that time splits across contexts (the former Balance tab).
        if (model.sharesTotalMs > 0) {
            item(key = "divider") { HorizontalDivider(color = PlanrTheme.colors.hairline) }
            item(key = "contextMix") { ContextMixSection(model, env, animationKey) }
            item(key = "shareShifts") { ShareShiftsSection(model.shares, env.categories) }
            item(key = "satisfaction") { SatisfactionSection(model, env.categories, onOpenAgenda) }
        }
    }
}

// --- Rhythm --------------------------------------------------------------------------

@Composable
private fun PatternsLede(model: PatternsModel, lede: Lede) {
    val weekdaysFull = stringArrayResource(R.array.insights_patterns_weekdays_full)
    val median = model.fragmentation.medianBlockMs
    val figures = buildList {
        add(
            LeadFigure(
                label = stringResource(R.string.insights_patterns_heaviest_weekday),
                value = durationText(model.topWeekday.avgMs),
                hint = weekdaysFull[model.topWeekday.weekday],
            ),
        )
        if (median != null) add(LeadFigure(stringResource(R.string.insights_patterns_typical_block), durationText(median)))
    }
    LedeRow(
        tone = lede.tone,
        headline = ledeText(lede.headline),
        support = lede.support?.let { ledeText(it) },
        figures = figures,
    )
}

@Composable
private fun WeekdaySection(model: PatternsModel, env: TabEnv, animationKey: Any) {
    val res = LocalResources.current
    val locale = rememberLabelLocale()
    // The web's chart aria plus its sr-only paragraph (patterns-tab.tsx:120-128), and each row's tooltip as its description.
    val (rows, description) = remember(model, locale, res, env.periodLabel) {
        val short = res.getStringArray(R.array.insights_patterns_weekdays_short)
        val full = res.getStringArray(R.array.insights_patterns_weekdays_full)
        val rows = model.weekdays.map { w ->
            val avg = DurationFormat.format(w.avgMs, locale)
            val total = DurationFormat.format(w.totalMs.toDouble(), locale)
            HBarRow(
                label = short[w.weekday],
                value = w.avgMs,
                valueText = avg,
                description = full[w.weekday] + ": " +
                    res.getString(R.string.insights_patterns_tooltip_avg_per_day, avg) + ", " +
                    res.getQuantityString(R.plurals.insights_patterns_tooltip_total, w.dayCount, total, w.dayCount),
            )
        }
        val top = model.topWeekday
        val frag = model.fragmentation
        val blocks = if (frag.blockCount > 0) {
            res.getString(
                R.string.insights_patterns_sr_blocks,
                frag.blockCount,
                DurationFormat.format(frag.medianBlockMs ?: 0.0, locale),
            )
        } else {
            ""
        }
        val description = res.getString(R.string.insights_patterns_by_weekday_aria, env.periodLabel) + ". " +
            res.getString(R.string.insights_patterns_sr_peak, full[top.weekday], DurationFormat.format(top.avgMs, locale)) +
            blocks
        rows to description
    }
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_patterns_by_weekday))
        HorizontalBars(
            rows = rows,
            color = PlanrTheme.colors.chart.series[0],
            contentDescription = description,
            animationKey = animationKey,
        )
    }
}

@Composable
private fun AttributesSection(model: PatternsModel, onOpenAgenda: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_patterns_attributes))
        if (!model.hasAttributes) {
            SectionEmpty(
                text = stringResource(R.string.insights_patterns_attributes_empty),
                actionLabel = stringResource(R.string.insights_common_empty_open_calendar),
                onAction = onOpenAgenda,
            )
            return@Column
        }
        val deep = model.deepWork
        val best = model.bestDaypart
        val worst = model.worstDaypart
        val mean = model.energy.meanEnergy
        val coverage = model.energy.coveragePct
        StatGrid {
            StatFigure(
                label = stringResource(R.string.insights_patterns_deep_work),
                value = deep.share?.let { "${JsMath.roundToInt(it * 100)}%" } ?: DASH,
                hint = if (deep.share != null) {
                    stringResource(R.string.insights_patterns_deep_work_hint, durationText((deep.deepMs + deep.shallowMs).toDouble()))
                } else {
                    stringResource(R.string.insights_patterns_deep_work_empty_hint)
                },
            )
            StatFigure(
                label = stringResource(R.string.insights_patterns_best_time_of_day),
                value = best?.let { stringResource(PatternsText.daypart(it.daypart)) } ?: DASH,
                hint = if (best != null) {
                    ratingHint(best)
                } else {
                    stringResource(R.string.insights_patterns_needs_ratings, PatternsSelectors.MIN_DAYPART_RATINGS)
                },
            )
            if (worst != null) {
                StatFigure(
                    label = stringResource(R.string.insights_patterns_toughest_time_of_day),
                    value = stringResource(PatternsText.daypart(worst.daypart)),
                    hint = ratingHint(worst),
                )
            }
            StatFigure(
                label = stringResource(R.string.insights_patterns_energy_level),
                value = mean?.let { "${JsMath.toFixed(it, 1)}/4" } ?: DASH,
                hint = if (coverage != null) {
                    stringResource(R.string.insights_patterns_energy_hint, coverage)
                } else {
                    stringResource(R.string.insights_patterns_energy_empty_hint)
                },
            )
        }
    }
}

/** `satisfaction x.x/4 · n N` (toFixed, never a locale format). */
@Composable
private fun ratingHint(d: DaypartRating): String =
    stringResource(R.string.insights_patterns_best_time_hint, JsMath.toFixed(d.agg.mean, 1), d.agg.n)

@Composable
private fun HeatmapSection(model: PatternsModel) {
    val res = LocalResources.current
    val locale = rememberLabelLocale()
    val data = remember(model.bands, locale, res) { heatmapData(model.bands, res, locale) }
    val color = PlanrTheme.colors.chart.series[0]
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_patterns_by_hour))
        // The phone layout at every width: 7 weekdays × 6 four-hour bands.
        Heatmap(
            data = data,
            contentDescription = stringResource(R.string.insights_patterns_heatmap_caption_bands),
            color = color,
            stepOf = HeatmapSteps::stepOf,
            stepAlpha = HeatmapSteps.STEP_ALPHA,
        )
        // The scale is absolute, not relative to the busiest cell.
        HeatmapLegend(
            labels = PatternsText.stepLabels.map { stringResource(it) },
            color = color,
            stepAlpha = HeatmapSteps.STEP_ALPHA,
        )
    }
}

/** hour-heatmap.tsx's band table: rows Monday-first, columns `0–4` … `20–24`, each cell labelled. */
private fun heatmapData(bands: List<Long>, res: Resources, locale: LabelLocale): HeatmapData {
    val short = res.getStringArray(R.array.insights_patterns_weekdays_short)
    val full = res.getStringArray(R.array.insights_patterns_weekdays_full)
    val nothing = res.getString(R.string.insights_patterns_heatmap_nothing)
    val values = List(7) { row -> List(BANDS) { col -> bands[row * BANDS + col] } }
    return HeatmapData(
        rowLabels = short.toList(),
        columnLabels = List(BANDS) { col -> "${col * 4}–${col * 4 + 4}" },
        values = values,
        cellDescriptions = List(7) { row ->
            List(BANDS) { col ->
                val ms = values[row][col]
                res.getString(
                    R.string.insights_patterns_heatmap_band_label,
                    full[row],
                    col * 4,
                    col * 4 + 4,
                    if (ms > 0) DurationFormat.format(ms.toDouble(), locale) else nothing,
                )
            }
        },
    )
}

@Composable
private fun FragmentationSection(model: PatternsModel) {
    val frag = model.fragmentation
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_patterns_fragmentation))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StatFigure(stringResource(R.string.insights_patterns_busy_blocks), frag.blockCount.toString())
            StatFigure(stringResource(R.string.insights_patterns_typical_block), frag.medianBlockMs?.let { durationText(it) } ?: DASH)
            StatFigure(
                stringResource(R.string.insights_patterns_longest_block),
                frag.longestBlockMs?.let { durationText(it.toDouble()) } ?: DASH,
            )
            StatFigure(
                stringResource(R.string.insights_patterns_short_blocks),
                frag.shortBlockShare?.let { "${JsMath.roundToInt(it * 100)}%" } ?: DASH,
            )
            StatFigure(stringResource(R.string.insights_patterns_typical_gap), frag.avgGapMs?.let { durationText(it) } ?: DASH)
        }
    }
}

// --- Balance half ---------------------------------------------------------------------

@Composable
private fun ContextMixSection(model: PatternsModel, env: TabEnv, animationKey: Any) {
    val mix = model.contextMix
    val g = model.granularity
    val res = LocalResources.current
    val locale = rememberLabelLocale()
    val names = mix.seriesKeys.map { seriesName(it, env.categories) }
    val colors = mix.seriesKeys.map { seriesColor(it, env.categories) }
    val series = remember(mix, colors) {
        mix.seriesKeys.mapIndexed { i, key -> BarSeries(key, mix.rows.map { it.byKey[key] ?: 0L }, colors[i]) }
    }
    val (ticks, bands) = remember(mix, g, env.zone, locale, names, colors, res) {
        val ticks = mix.rows.map { InsightsLabels.bucketTick(it.start, g, env.zone, locale) }
        val bands = mix.rows.map { row ->
            BandInfo(
                title = InsightsLabels.bucketLabel(MsWindow(row.start, row.end), g, env.zone, locale),
                rows = mix.seriesKeys.mapIndexedNotNull { i, key ->
                    val ms = row.byKey[key] ?: 0L
                    if (ms > 0) TooltipRow(colors[i], names[i], DurationFormat.format(ms.toDouble(), locale)) else null
                },
            )
        }
        ticks to bands
    }
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(PatternsText.contextMix(g)))
        StackedBarChart(
            series = series,
            ticks = ticks,
            contentDescription = stringResource(PatternsText.contextMixAria(g), env.periodLabel),
            bands = bands,
            animationKey = animationKey,
        )
        SeriesLegend(items = mix.seriesKeys.mapIndexed { i, key -> LegendItem(key, names[i], colors[i]) })
    }
}

/** The share-shift table (balance-tab.tsx:140-215) without the Prev column: the web hides it below `sm`. */
@Composable
private fun ShareShiftsSection(shares: List<CategoryShare>, categories: Map<String, Category>) {
    val caption = stringResource(R.string.insights_patterns_share_shifts_caption)
    val headerStyle = MaterialTheme.typography.labelSmall
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    // The Time column fits its widest duration on one line ("12 ч 30 мин" is wider than "12h 30m").
    val timeHeader = stringResource(R.string.insights_patterns_col_time)
    val numbers = PlanrTheme.type.timeMedium
    val locale = rememberLabelLocale()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val timeColumn = remember(shares, locale, numbers, headerStyle, timeHeader, measurer, density) {
        val widest = maxOf(
            measurer.measure(timeHeader, headerStyle).size.width,
            shares.maxOfOrNull { measurer.measure(DurationFormat.format(it.ms.toDouble(), locale), numbers).size.width } ?: 0,
        )
        maxOf(TIME_COLUMN, with(density) { widest.toDp() })
    }
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_patterns_share_shifts))
        Column(
            Modifier.semantics {
                contentDescription = caption
                collectionInfo = CollectionInfo(rowCount = shares.size, columnCount = 4)
            },
        ) {
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).clearAndSetSemantics {}) {
                Text(stringResource(R.string.insights_patterns_col_context), Modifier.weight(1f), style = headerStyle, color = muted)
                HeaderCell(timeHeader, timeColumn)
                HeaderCell(stringResource(R.string.insights_patterns_col_share), SHARE_COLUMN)
                HeaderCell(stringResource(R.string.insights_patterns_col_delta), DELTA_COLUMN)
            }
            for (share in shares) {
                HorizontalDivider(color = PlanrTheme.colors.hairline)
                ShareShiftRow(share, categories, timeColumn)
            }
        }
    }
}

@Composable
private fun HeaderCell(text: String, width: Dp) {
    Text(
        text,
        Modifier.width(width),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.End,
    )
}

@Composable
private fun ShareShiftRow(share: CategoryShare, categories: Map<String, Category>, timeColumn: Dp) {
    val key = SeriesKeys.of(share.categoryId)
    val pts = JsMath.roundToInt(share.deltaShare * 100)
    val spoken = when {
        pts > 0 -> stringResource(R.string.insights_patterns_delta_points_up, pts)
        pts < 0 -> stringResource(R.string.insights_patterns_delta_points_down, abs(pts))
        else -> stringResource(R.string.insights_patterns_delta_no_change)
    }
    val deltaText = when {
        pts > 0 -> "▲ " + stringResource(R.string.insights_patterns_pts, pts)
        pts < 0 -> "▼ " + stringResource(R.string.insights_patterns_pts, abs(pts))
        else -> "–"
    }
    val numbers = PlanrTheme.type.timeMedium
    // One spoken row: name, time, share, then the shift in words (the glyphs are not read).
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Swatch(seriesColor(key, categories))
        Spacer(Modifier.width(8.dp))
        Text(
            seriesName(key, categories),
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            durationText(share.ms.toDouble()),
            Modifier.width(timeColumn),
            style = numbers,
            textAlign = TextAlign.End,
            maxLines = 1,
        )
        Text("${JsMath.roundToInt(share.share * 100)}%", Modifier.width(SHARE_COLUMN), style = numbers, textAlign = TextAlign.End)
        Text(
            rememberGlyphText(deltaText),
            Modifier
                .width(DELTA_COLUMN)
                .clearAndSetSemantics { contentDescription = spoken },
            style = numbers,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.End,
        )
    }
}

@Composable
private fun SatisfactionSection(model: PatternsModel, categories: Map<String, Category>, onOpenAgenda: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SectionLabel(stringResource(R.string.insights_patterns_satisfaction_by_context))
        if (model.satisfaction.isEmpty()) {
            SectionEmpty(
                text = stringResource(R.string.insights_patterns_satisfaction_empty, CorrelationsAnalytics.MIN_CATEGORY_RATINGS),
                actionLabel = stringResource(R.string.insights_common_empty_open_calendar),
                onAction = onOpenAgenda,
            )
            return@Column
        }
        for (rating in model.satisfaction) {
            val key = SeriesKeys.of(rating.categoryId)
            val name = seriesName(key, categories)
            val color = seriesColor(key, categories)
            val mean = JsMath.toFixed(rating.agg.mean, 1)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Swatch(color)
                Spacer(Modifier.width(8.dp))
                Text(
                    name,
                    Modifier.width(112.dp),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.width(8.dp))
                TrackBar(
                    fraction = (rating.agg.mean / 4).toFloat(),
                    color = color,
                    contentDescription = stringResource(R.string.insights_patterns_satisfaction_aria, name, mean, rating.agg.n),
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "$mean/4",
                    Modifier.width(48.dp),
                    style = PlanrTheme.type.timeMedium,
                    textAlign = TextAlign.End,
                )
                Text(
                    "n ${rating.agg.n}",
                    Modifier.width(44.dp),
                    style = PlanrTheme.type.timeMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.End,
                )
            }
        }
    }
}

// --- Bits -----------------------------------------------------------------------------

/** A 10 dp category swatch; the name next to it carries the meaning. */
@Composable
private fun Swatch(color: Color) {
    Spacer(
        Modifier
            .size(10.dp)
            .background(color, RoundedCornerShape(3.dp)),
    )
}

private const val DASH = "—"
private const val BANDS = 6
/** The Time column's minimum; it widens to its widest duration. */
private val TIME_COLUMN = 64.dp
private val SHARE_COLUMN = 44.dp
private val DELTA_COLUMN = 64.dp

// --- Preview --------------------------------------------------------------------------

@Preview(name = "Light", showBackground = true, backgroundColor = 0xFFFAF8F5, widthDp = 360, heightDp = 2200)
@Preview(
    name = "Dark",
    showBackground = true,
    backgroundColor = 0xFF1C1917,
    widthDp = 360,
    heightDp = 2200,
    uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL,
)
@Preview(name = "Light ru", locale = "ru", showBackground = true, backgroundColor = 0xFFFAF8F5, widthDp = 360, heightDp = 2200)
@Preview(
    name = "Dark ru",
    locale = "ru",
    showBackground = true,
    backgroundColor = 0xFF1C1917,
    widthDp = 360,
    heightDp = 2200,
    uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL,
)
@Composable
private fun PatternsTabPreview() {
    val inputs = remember { PreviewPatterns.inputs() }
    val model = remember(inputs) { buildPatternsModel(inputs) }
    PlanrTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            PatternsTab(
                model = model,
                env = TabEnv(
                    zone = inputs.zone,
                    categories = inputs.categories,
                    preset = inputs.state.preset,
                    periodLabel = "Last 30 days · 12 May – 10 Jun 2026",
                    now = inputs.now,
                    window = inputs.period.window,
                ),
                header = {},
                onOpenAgenda = {},
            )
        }
    }
}

/** A fixed month of rated work, gym and home time in Berlin (literal data; no randomness in previews). */
private object PreviewPatterns {
    private val zone: ZoneId = ZoneId.of("Europe/Berlin")
    private const val HOUR = 3_600_000L
    private val categories = listOf(
        Category(id = "work", workspaceId = "ws", ownerId = "me", name = "Work", color = "#2a77b8"),
        Category(id = "gym", workspaceId = "ws", ownerId = "me", name = "Gym", color = "#1f8643"),
        Category(id = "home", workspaceId = "ws", ownerId = null, name = "Home", color = "#b45309"),
    )

    fun inputs(): InsightsInputs {
        val now = at(2026, 6, 10, 12)
        val state = PeriodState(preset = PeriodPreset.Last30d)
        val period = Periods.resolve(state, zone, now)
        val spans = (0 until 60).flatMap { back -> day(now - back * 24 * HOUR, back) }
        return InsightsInputs(
            viewerId = "me",
            zone = zone,
            now = now,
            state = state,
            period = period,
            spans = spans.filter { it.start < period.window.end && it.end > period.window.start },
            prevSpans = spans.filter { it.start < period.prevWindow.end && it.end > period.prevWindow.start },
            tasks = emptyList(),
            categories = categories.associateByTo(LinkedHashMap()) { it.id },
        )
    }

    private fun day(dayMs: Long, n: Int): List<Span> {
        val date = Periods.localDate(dayMs, zone)
        val weekend = date.dayOfWeek.value >= 6
        val base = date.atStartOfDay(zone).toInstant().toEpochMilli()
        fun span(key: String, fromHour: Double, hours: Double, category: String?, attributes: Attributes) = Span(
            key = "$key-$n",
            eventId = key,
            title = key,
            start = base + (fromHour * HOUR).toLong(),
            end = base + ((fromHour + hours) * HOUR).toLong(),
            kind = EventKind.Event,
            allDay = false,
            inactive = false,
            ownerId = "me",
            isShared = category == "home",
            categoryId = category,
            attributes = attributes,
        )
        return if (weekend) {
            listOf(span("home", 10.0, 2.5 + n % 3, "home", Attributes(satisfaction = 3 + n % 2)))
        } else {
            listOf(
                span("focus", 9.0, 2.0 + n % 2, "work", Attributes(energy = 3, focus = Focus.Deep, satisfaction = 3 + n % 2)),
                span("meetings", 13.5, 1.0 + (n % 4) * 0.5, "work", Attributes(focus = Focus.Shallow, satisfaction = 2)),
                span("gym", 18.0, 1.0, "gym", Attributes(energy = 4, satisfaction = 4)),
                span("errand", 20.5, 0.5, null, Attributes.None),
            )
        }
    }

    private fun at(year: Int, month: Int, day: Int, hour: Int): Long =
        LocalDateTime.of(year, month, day, hour, 0).atZone(zone).toInstant().toEpochMilli()
}
