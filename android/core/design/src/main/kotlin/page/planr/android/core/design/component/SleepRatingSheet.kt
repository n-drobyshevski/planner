package page.planr.android.core.design.component

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import page.planr.android.core.design.R
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS

/**
 * The sheet's values. Times are minutes after midnight on the wall clock;
 * [timesEdited] turns true once the member picks either time, so a caller
 * can leave a night's stored (device) times alone otherwise.
 */
@Immutable
data class SleepRatingDraft(
    val bedtimeMinutes: Int,
    val wakeMinutes: Int,
    /** 1..[QUALITY_LEVELS] (poor → great) */
    val quality: Int? = null,
    /** 1..[FATIGUE_LEVELS], the Karolinska Sleepiness Scale (alert → fighting sleep) */
    val fatigue: Int? = null,
    val note: String = "",
    val timesEdited: Boolean = false,
) {
    companion object {
        /** The web's scales (log-fields.tsx): quality 1–7, tiredness 1–9. */
        const val QUALITY_LEVELS = 7
        const val FATIGUE_LEVELS = 9
        const val NOTE_MAX = 200
    }
}

/**
 * One night's check-in (checkin-card.tsx + log-fields.tsx): bedtime and
 * wake (time pickers), the 7-point quality scale, Karolinska tiredness and
 * an optional note. Stateless: the caller owns [draft] and saving, so the
 * agenda's morning card, the Insights Sleep tab and any later surface open
 * the same sheet.
 *
 * @param nightLabel the wake date as text ("Tue, 6 Oct").
 * @param fromHealthConnect the times came from the member's tracker.
 * @param error a failed save, shown above the button (the sheet stays open to retry).
 *
 * While [saving], Back, a scrim tap or a swipe down can't hide the sheet:
 * callers keep it composed until the save settles, so a hidden-but-composed
 * sheet would block the screen below and swallow a failed save's [error].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SleepRatingSheet(
    nightLabel: String,
    draft: SleepRatingDraft,
    fromHealthConnect: Boolean,
    saving: Boolean,
    onChange: (SleepRatingDraft) -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
    error: String? = null,
) {
    val currentSaving by rememberUpdatedState(saving)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { sleepSheetMayMoveTo(it, saving = currentSaving) },
        ),
        containerColor = PlanrTheme.colors.card,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = PlanrSpacing.xl)
                .padding(bottom = PlanrSpacing.xl)
                .navigationBarsPadding()
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
                Text(
                    stringResource(R.string.sleep_rating_title),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                val morning = stringResource(R.string.sleep_rating_morning_of, nightLabel)
                val source = stringResource(R.string.sleep_rating_from_health_connect)
                Text(
                    if (fromHealthConnect) "$morning · $source" else morning,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    stringResource(R.string.sleep_rating_private),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg)) {
                SleepTimeField(
                    label = stringResource(R.string.sleep_rating_went_to_bed),
                    minutes = draft.bedtimeMinutes,
                    onPick = { onChange(draft.copy(bedtimeMinutes = it, timesEdited = true)) },
                    modifier = Modifier.weight(1f),
                )
                SleepTimeField(
                    label = stringResource(R.string.sleep_rating_woke_up),
                    minutes = draft.wakeMinutes,
                    onPick = { onChange(draft.copy(wakeMinutes = it, timesEdited = true)) },
                    modifier = Modifier.weight(1f),
                )
            }

            FieldBlock(stringResource(R.string.sleep_rating_quality)) {
                SleepRatingScale(
                    labels = stringArrayResource(R.array.sleep_rating_quality_levels).toList(),
                    value = draft.quality,
                    onValueChange = { onChange(draft.copy(quality = it)) },
                )
            }
            FieldBlock(stringResource(R.string.sleep_rating_fatigue)) {
                SleepRatingScale(
                    labels = stringArrayResource(R.array.sleep_rating_fatigue_levels).toList(),
                    value = draft.fatigue,
                    onValueChange = { onChange(draft.copy(fatigue = it)) },
                )
                Text(
                    stringResource(R.string.sleep_rating_clear_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = draft.note,
                onValueChange = { onChange(draft.copy(note = it.take(SleepRatingDraft.NOTE_MAX))) },
                label = { Text(stringResource(R.string.sleep_rating_note)) },
                placeholder = { Text(stringResource(R.string.sleep_rating_optional)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )

            if (error != null) {
                Text(
                    error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            Button(
                onClick = onSave,
                enabled = !saving,
                modifier = Modifier
                    .align(Alignment.End)
                    .heightIn(min = PlanrSpacing.touchTarget),
            ) {
                Text(stringResource(if (saving) R.string.sleep_rating_saving else R.string.sleep_rating_save))
            }
        }
    }
}

/** Whether the rating sheet may settle at [target]: anything but hidden while a save is in flight. */
@OptIn(ExperimentalMaterial3Api::class)
internal fun sleepSheetMayMoveTo(target: SheetValue, saving: Boolean): Boolean =
    target != SheetValue.Hidden || !saving

@Composable
private fun FieldBlock(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
        content()
    }
}

/**
 * One segmented scale (rating-scale.tsx): numbers in the segments, the end
 * anchors' words beneath, and a caption with the chosen level's full label,
 * so the meaning never rests on position alone. Each segment speaks its full
 * label; tapping the chosen one again clears it.
 */
@Composable
fun SleepRatingScale(
    labels: List<String>,
    value: Int?,
    onValueChange: (Int?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(PlanrRadii.sm)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
        Row(
            Modifier
                .fillMaxWidth()
                .selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
        ) {
            labels.forEachIndexed { index, label ->
                val level = index + 1
                val selected = value == level
                val colors = MaterialTheme.colorScheme
                Box(
                    Modifier
                        .weight(1f)
                        .heightIn(min = PlanrSpacing.touchTarget)
                        .background(if (selected) colors.primary else colors.surface, shape)
                        .border(1.dp, if (selected) colors.primary else colors.outlineVariant, shape)
                        .selectable(
                            selected = selected,
                            role = Role.RadioButton,
                            onClick = { onValueChange(if (selected) null else level) },
                        )
                        .semantics { contentDescription = label },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        level.toString(),
                        style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = TABULAR_NUMS),
                        color = if (selected) colors.onPrimary else colors.onSurface,
                        modifier = Modifier.clearAndSetSemantics {},
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().clearAndSetSemantics {}, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                ratingWord(labels.first()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                ratingWord(labels.last()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.End,
            )
        }
        Text(
            value?.let { labels.getOrNull(it - 1) }.orEmpty(),
            style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = TABULAR_NUMS),
            modifier = Modifier
                .heightIn(min = 16.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/** "5 Neither alert nor sleepy" → "Neither alert nor sleepy" (rating-scale.tsx `wordOf`). */
fun ratingWord(label: String): String = label.replace(LEADING_NUMBER, "")

private val LEADING_NUMBER = Regex("""^\d+\s*""")

/** A time button that opens Material's time picker (12/24 h per the device). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SleepTimeField(label: String, minutes: Int, onPick: (Int) -> Unit, modifier: Modifier = Modifier) {
    var open by rememberSaveable { mutableStateOf(false) }
    val text = rememberClockText(minutes)
    val spoken = stringResource(R.string.sleep_rating_time_value, label, text)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.clearAndSetSemantics {},
        )
        OutlinedButton(
            onClick = { open = true },
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = PlanrSpacing.touchTarget)
                .semantics { contentDescription = spoken },
        ) {
            Text(text, style = LocalTextStyle.current.copy(fontFeatureSettings = TABULAR_NUMS), maxLines = 1)
        }
    }
    if (!open) return
    val is24Hour = DateFormat.is24HourFormat(LocalContext.current)
    val state = rememberTimePickerState(initialHour = minutes / 60, initialMinute = minutes % 60, is24Hour = is24Hour)
    BasicAlertDialog(onDismissRequest = { open = false }) {
        Surface(shape = MaterialTheme.shapes.extraLarge, tonalElevation = 6.dp) {
            Column(
                modifier = Modifier.padding(PlanrSpacing.xl),
                verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
            ) {
                Text(label, style = MaterialTheme.typography.titleMedium)
                TimePicker(state = state)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { open = false }) { Text(stringResource(R.string.sleep_rating_cancel)) }
                    TextButton(onClick = {
                        open = false
                        onPick(state.hour * 60 + state.minute)
                    }) { Text(stringResource(R.string.sleep_rating_done)) }
                }
            }
        }
    }
}

/** [minutes] after midnight as the device writes a time ("23:40" / "11:40 PM"). */
@Composable
fun rememberClockText(minutes: Int): String {
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val is24Hour = DateFormat.is24HourFormat(context)
    return remember(minutes, locale, is24Hour) {
        val pattern = DateFormat.getBestDateTimePattern(locale, if (is24Hour) "Hm" else "hm")
        DateTimeFormatter.ofPattern(pattern, locale).format(LocalTime.of(minutes / 60 % 24, minutes % 60))
    }
}
