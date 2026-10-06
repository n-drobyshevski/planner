package page.planr.android.feature.tasks.detail

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.util.Locale
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.tasks.R
import page.planr.android.feature.tasks.model.BlockSlots
import page.planr.android.feature.tasks.ui.currentLocale
import page.planr.android.feature.tasks.ui.formatTime
import page.planr.android.feature.tasks.ui.formatWeekdayDayMonth
import page.planr.android.feature.tasks.ui.is24HourClock
import page.planr.android.feature.tasks.ui.pickerMillisToDate
import page.planr.android.feature.tasks.ui.toPickerMillis

/**
 * "On the calendar": the task's blocks, upcoming then past (muted), each
 * opening its event; the owner's own blocks can be taken off the calendar.
 * The owner adds one from "Add to calendar" at the end.
 */
@Composable
internal fun TaskBlocksSection(
    state: TaskDetailUiState,
    onOpenEvent: (eventId: String) -> Unit,
    onRemove: (eventId: String) -> Unit,
    onAdd: () -> Unit,
) {
    // Not mid-write: the save or delete closes this screen once it lands.
    val idle = !state.saving && !state.deleting
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
        Text(
            text = stringResource(R.string.task_blocks_title),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.semantics { heading() },
        )
        state.blocks.forEach { item ->
            BlockRow(
                item = item,
                zone = state.zone,
                enabled = idle,
                onOpen = { onOpenEvent(item.event.id) },
                onRemove = { onRemove(item.event.id) },
            )
        }
        if (state.canSchedule) {
            OutlinedButton(
                onClick = onAdd,
                enabled = idle && state.blockSheet == null,
                modifier = Modifier.padding(top = PlanrSpacing.xs),
            ) {
                Icon(
                    painterResource(R.drawable.ic_task_calendar),
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
                Text(stringResource(R.string.task_schedule_add), modifier = Modifier.padding(start = PlanrSpacing.sm))
            }
        }
    }
}

@Composable
private fun BlockRow(item: TaskBlockItem, zone: TimeZone, enabled: Boolean, onOpen: () -> Unit, onRemove: () -> Unit) {
    val openLabel = stringResource(R.string.task_block_open)
    val tone = if (item.past) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(MaterialTheme.shapes.small)
            .clickable(enabled = enabled, onClickLabel = openLabel, onClick = onOpen),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = blockRange(item, zone, is24HourClock(), currentLocale()),
            style = PlanrTheme.type.timeMedium,
            color = tone,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(vertical = PlanrSpacing.xs),
        )
        if (item.canRemove) {
            IconButton(onClick = onRemove, enabled = enabled && !item.pending) {
                Icon(
                    painterResource(R.drawable.ic_task_delete),
                    contentDescription = stringResource(R.string.task_block_remove),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

/** "Tue, Oct 6 · 14:00–14:30", in the member's zone. */
@Composable
private fun blockRange(item: TaskBlockItem, zone: TimeZone, is24Hour: Boolean, locale: Locale): String {
    val start = item.event.start.toLocalDateTime(zone)
    val end = item.event.end.toLocalDateTime(zone)
    return stringResource(
        R.string.task_block_range,
        formatWeekdayDayMonth(start.date, locale),
        formatTime(start.time, is24Hour, locale),
        formatTime(end.time, is24Hour, locale),
    )
}

/**
 * "Add to calendar" (the web's schedule dialog, one block): a day, a start
 * proposed in the first free slot and the duration chips. Swiping it away or
 * Cancel closes it; while the block is being created it stays put.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun BlockSheet(
    taskTitle: String,
    sheet: BlockSheetState,
    onDateChange: (LocalDate) -> Unit,
    onStartChange: (LocalTime) -> Unit,
    onMinutesChange: (Int) -> Unit,
    onAdd: () -> Unit,
    onDismiss: () -> Unit,
) {
    // The sheet state keeps its first confirmValueChange, so it reads the flag through a State.
    val saving by rememberUpdatedState(sheet.saving)
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { it != SheetValue.Hidden || !saving },
    )
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PlanrTheme.colors.card,
    ) {
        // The sheet's own Back hides it without asking confirmValueChange.
        BackHandler(enabled = sheet.saving) {}
        val enabled = !sheet.saving
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = PlanrSpacing.xl, end = PlanrSpacing.xl, bottom = PlanrSpacing.xl),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
                Text(
                    text = stringResource(R.string.task_schedule_title),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = taskTitle.ifBlank { stringResource(R.string.task_detail_untitled) },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg)) {
                Labeled(stringResource(R.string.task_schedule_date), Modifier.weight(1f)) {
                    DateButton(sheet.date, enabled, onDateChange)
                }
                Labeled(stringResource(R.string.task_schedule_start), Modifier.weight(1f)) {
                    TimeButton(sheet.start, enabled, onStartChange)
                }
            }
            Labeled(stringResource(R.string.task_schedule_duration)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
                    BlockSlots.DURATIONS.forEach { minutes ->
                        FilterChip(
                            selected = sheet.minutes == minutes,
                            onClick = { onMinutesChange(minutes) },
                            enabled = enabled,
                            label = { Text(durationLabel(minutes)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                            ),
                        )
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm, Alignment.End),
            ) {
                TextButton(onClick = onDismiss, enabled = enabled) { Text(stringResource(R.string.task_schedule_cancel)) }
                Button(onClick = onAdd, enabled = enabled) {
                    Text(stringResource(if (sheet.saving) R.string.task_schedule_adding else R.string.task_schedule_add))
                }
            }
        }
    }
}

@Composable
private fun Labeled(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateButton(date: LocalDate, enabled: Boolean, onPick: (LocalDate) -> Unit) {
    var picking by rememberSaveable { mutableStateOf(false) }
    OutlinedButton(onClick = { picking = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text(formatWeekdayDayMonth(date, currentLocale()), maxLines = 1)
    }
    if (picking) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = date.toPickerMillis())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { onPick(pickerMillisToDate(it)) }
                    picking = false
                }) { Text(stringResource(R.string.task_date_pick)) }
            },
            dismissButton = {
                TextButton(onClick = { picking = false }) { Text(stringResource(R.string.task_date_cancel)) }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

/** A compact typed time entry; it fits a dialog on any phone, unlike the clock dial. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeButton(time: LocalTime, enabled: Boolean, onPick: (LocalTime) -> Unit) {
    var picking by rememberSaveable { mutableStateOf(false) }
    val is24Hour = is24HourClock()
    OutlinedButton(onClick = { picking = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text(formatTime(time, is24Hour, currentLocale()), style = PlanrTheme.type.timeMedium)
    }
    if (picking) {
        val pickerState = rememberTimePickerState(initialHour = time.hour, initialMinute = time.minute, is24Hour = is24Hour)
        AlertDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    onPick(LocalTime(pickerState.hour, pickerState.minute))
                    picking = false
                }) { Text(stringResource(R.string.task_date_pick)) }
            },
            dismissButton = {
                TextButton(onClick = { picking = false }) { Text(stringResource(R.string.task_date_cancel)) }
            },
            text = { TimeInput(state = pickerState) },
        )
    }
}

@Composable
private fun durationLabel(minutes: Int): String = stringResource(
    when (minutes) {
        15 -> R.string.task_schedule_15min
        30 -> R.string.task_schedule_30min
        45 -> R.string.task_schedule_45min
        60 -> R.string.task_schedule_1hour
        90 -> R.string.task_schedule_1and_half_hours
        else -> R.string.task_schedule_2hours
    },
)
