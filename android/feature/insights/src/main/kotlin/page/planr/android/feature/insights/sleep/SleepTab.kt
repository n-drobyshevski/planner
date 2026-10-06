package page.planr.android.feature.insights.sleep

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneOffset
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import page.planr.android.core.design.R as DesignR
import page.planr.android.core.design.component.SleepRatingSheet
import page.planr.android.core.design.component.rememberClockText
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.shell.InsightsSkeleton
import page.planr.android.feature.insights.shell.LoadError
import page.planr.android.feature.insights.shell.RefreshFailedBanner
import page.planr.android.feature.insights.ui.components.durationText
import page.planr.android.feature.insights.ui.components.rememberLabelLocale

/** The four stages in bar order (stages-section.tsx): deep, light, REM, awake. */
private enum class Stage { Deep, Light, Rem, Awake }

/**
 * The Sleep tab: the viewer's last 14 nights, newest first. Each row shows
 * bedtime–wake, time in bed, the quality rating, whether the tracker
 * recorded it, and its stage bar; tapping one opens the rating sheet.
 * Only the viewer's own nights: `sleep_logs` is member-private.
 */
@Composable
internal fun SleepTab(viewModel: SleepNightsViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.onShown() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.onShown() }

    val model = state.model
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        when {
            model == null && state.loadFailed -> item(key = "error") { LoadError(onRetry = viewModel::refresh) }
            model == null -> item(key = "loading") { InsightsSkeleton() }
            else -> {
                if (state.loadFailed) item(key = "banner") { RefreshFailedBanner(onRetry = viewModel::refresh) }
                if (model.isEmpty) {
                    item(key = "empty") { SleepEmpty() }
                } else {
                    item(key = "lede") {
                        Text(
                            stringResource(R.string.sleep_tab_lede),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    item(key = "nights") { NightList(model, onOpen = viewModel::openNight) }
                    if (model.hasStages) item(key = "legend") { StageLegend() }
                }
            }
        }
    }

    state.sheet?.let { sheet ->
        val locale = rememberLabelLocale()
        SleepRatingSheet(
            nightLabel = remember(sheet.form.date, locale) { dayLabel(sheet.form.date, locale) },
            draft = sheet.form.toDraft(),
            fromHealthConnect = sheet.form.fromHealthConnect,
            saving = sheet.saving,
            error = when {
                sheet.timesOutOfOrder -> stringResource(DesignR.string.sleep_rating_times_order)
                sheet.failed -> stringResource(DesignR.string.sleep_rating_save_failed)
                else -> null
            },
            onChange = viewModel::updateDraft,
            onSave = viewModel::save,
            onDismiss = viewModel::closeSheet,
        )
    }
}

/** One calm line: where nights come from. */
@Composable
private fun SleepEmpty() {
    Text(
        stringResource(R.string.sleep_tab_empty),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = PlanrSpacing.xl),
    )
}

/** The nights in one flat, hairline-bordered card, divided by hairlines. */
@Composable
private fun NightList(model: SleepNightsModel, onOpen: (LocalDate) -> Unit) {
    val shape = RoundedCornerShape(PlanrRadii.xl)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(PlanrTheme.colors.card)
            .border(1.dp, PlanrTheme.colors.hairline, shape),
    ) {
        model.nights.forEachIndexed { index, night ->
            if (index > 0) HorizontalDivider(color = PlanrTheme.colors.hairline)
            NightRow(night, onClick = { onOpen(night.date) })
        }
    }
}

@Composable
private fun NightRow(night: SleepNightRow, onClick: () -> Unit) {
    val locale = rememberLabelLocale()
    val day = remember(night.date, locale) { dayLabel(night.date, locale) }
    val qualityLabels = stringArrayResource(DesignR.array.sleep_rating_quality_levels)
    val quality = night.quality?.let { qualityLabels.getOrNull(it - 1) }
    val times = if (night.bedtime != null && night.wake != null) {
        stringResource(R.string.sleep_tab_times, clock(night.bedtime), clock(night.wake))
    } else {
        null
    }
    val inBed = night.inBedMin?.let { stringResource(R.string.sleep_tab_in_bed, durationText(it * MINUTE_MS)) }
    val asleep = night.asleepMin?.let { stringResource(R.string.sleep_tab_asleep, durationText(it * MINUTE_MS)) }
    val source = if (night.fromHealthConnect) stringResource(DesignR.string.sleep_rating_from_health_connect) else null
    val detail = listOfNotNull(times, inBed, source).joinToString(" · ")
    val stageSummary = night.stages?.let { stageSummary(it) }
    val notRated = stringResource(R.string.sleep_tab_not_rated)
    val spoken = stringResource(
        R.string.sleep_tab_sr_night,
        day,
        listOfNotNull(times, inBed, asleep, quality ?: notRated, source, stageSummary).joinToString(", "),
    )

    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClickLabel = stringResource(R.string.sleep_tab_rate), role = Role.Button, onClick = onClick)
            .clearAndSetSemantics { contentDescription = spoken }
            .padding(horizontal = PlanrSpacing.lg, vertical = PlanrSpacing.md),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                day,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            QualityMark(quality = quality, notRated = notRated)
        }
        if (detail.isNotEmpty()) {
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = TABULAR_NUMS),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        night.stages?.let { stages ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.md)) {
                StageBar(stages, Modifier.weight(1f))
                if (asleep != null) {
                    Text(
                        asleep,
                        style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = TABULAR_NUMS),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** A small dot and the rating's label; a hollow dot for an unrated night. */
@Composable
private fun QualityMark(quality: String?, notRated: String) {
    val stone = PlanrTheme.colors.chart.series[0]
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Box(
            Modifier
                .size(8.dp)
                .then(if (quality != null) Modifier.background(stone, CircleShape) else Modifier.border(1.dp, stone, CircleShape)),
        )
        Text(
            quality ?: notRated,
            style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = TABULAR_NUMS),
            color = if (quality != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Deep / light / REM / awake as one thin bar, each stage's share of the night. */
@Composable
private fun StageBar(stages: SleepStageMinutes, modifier: Modifier = Modifier) {
    val colors = stageColors()
    Row(
        modifier
            .height(6.dp)
            .clip(CircleShape)
            .background(PlanrTheme.colors.chart.trackStrong),
    ) {
        if (stages.total > 0) {
            Stage.entries.forEach { stage ->
                val minutes = stages.minutesOf(stage)
                if (minutes > 0) {
                    Box(
                        Modifier
                            .weight(minutes.toFloat())
                            .fillMaxSize()
                            .background(colors.getValue(stage)),
                    )
                }
            }
        }
    }
}

/** The stage colours: only deep and REM are coloured; light and awake stay neutral, as on the web. */
@Composable
private fun stageColors(): Map<Stage, Color> {
    val chart = PlanrTheme.colors.chart
    return mapOf(
        Stage.Deep to chart.series[3],
        Stage.Light to chart.series[0].copy(alpha = 0.45f),
        Stage.Rem to chart.series[4],
        Stage.Awake to chart.neutral.copy(alpha = 0.3f),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StageLegend() {
    val colors = stageColors()
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
        modifier = Modifier.semantics(mergeDescendants = true) {},
    ) {
        Stage.entries.forEach { stage ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
                Box(Modifier.size(8.dp).background(colors.getValue(stage), CircleShape))
                Text(
                    stringResource(stage.label()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun stageSummary(stages: SleepStageMinutes): String = Stage.entries.map { stage ->
    stringResource(stage.spoken(), durationText(stages.minutesOf(stage) * MINUTE_MS))
}.joinToString(", ")

@Composable
private fun clock(time: LocalTime): String = rememberClockText(time.hour * 60 + time.minute)

private fun SleepStageMinutes.minutesOf(stage: Stage): Int = when (stage) {
    Stage.Deep -> deep
    Stage.Light -> light
    Stage.Rem -> rem
    Stage.Awake -> awake
}

private fun Stage.label(): Int = when (this) {
    Stage.Deep -> R.string.sleep_tab_stage_deep
    Stage.Light -> R.string.sleep_tab_stage_light
    Stage.Rem -> R.string.sleep_tab_stage_rem
    Stage.Awake -> R.string.sleep_tab_stage_awake
}

private fun Stage.spoken(): Int = when (this) {
    Stage.Deep -> R.string.sleep_tab_sr_deep
    Stage.Light -> R.string.sleep_tab_sr_light
    Stage.Rem -> R.string.sleep_tab_sr_rem
    Stage.Awake -> R.string.sleep_tab_sr_awake
}

/** "Tue, 6 Oct" (format.ts `formatWeekdayDayMonth`) for a wake date. */
private fun dayLabel(date: LocalDate, locale: LabelLocale): String =
    InsightsLabels.weekdayDayMonth(date.atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds(), ZoneOffset.UTC, locale)

private const val MINUTE_MS = 60_000.0
