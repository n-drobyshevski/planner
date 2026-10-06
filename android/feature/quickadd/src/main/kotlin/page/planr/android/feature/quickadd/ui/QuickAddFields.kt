package page.planr.android.feature.quickadd.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardCapitalization
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.quickadd.QuickAddUiState
import page.planr.android.feature.quickadd.QuickAddViewModel
import page.planr.android.feature.quickadd.R

/** A task's due date: none, today, tomorrow, or a picked day. */
@Composable
internal fun TaskFields(state: QuickAddUiState, enabled: Boolean, viewModel: QuickAddViewModel) {
    Labeled(stringResource(R.string.quickadd_due)) {
        DateChoices(
            selected = state.form.dueDate,
            today = state.today,
            tomorrow = state.tomorrow,
            enabled = enabled,
            allowNone = true,
            onSelect = viewModel::setDueDate,
        )
    }
}

/** An event's day, then all-day or a start and end time. */
@Composable
internal fun EventFields(state: QuickAddUiState, enabled: Boolean, viewModel: QuickAddViewModel) {
    val form = state.form
    Labeled(stringResource(R.string.quickadd_date)) {
        DateChoices(
            selected = form.date,
            today = state.today,
            tomorrow = state.tomorrow,
            enabled = enabled,
            allowNone = false,
            onSelect = { date -> date?.let(viewModel::setDate) },
        )
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(value = form.allDay, enabled = enabled, role = Role.Switch, onValueChange = viewModel::setAllDay),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.quickadd_all_day), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Switch(checked = form.allDay, onCheckedChange = null, enabled = enabled)
    }
    if (!form.allDay) {
        Row(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg)) {
            Labeled(stringResource(R.string.quickadd_start), Modifier.weight(1f)) {
                TimeButton(form.startTime, enabled, viewModel::setStartTime)
            }
            Labeled(stringResource(R.string.quickadd_end), Modifier.weight(1f)) {
                TimeButton(form.endTime, enabled, viewModel::setEndTime, suffix = if (form.endsNextDay) stringResource(R.string.quickadd_next_day) else null)
            }
        }
    }
}

/**
 * Optional notes: an "Add notes" link until there are some (shared text
 * arrives with them), then a multi-line field that stays open even if
 * cleared, so it doesn't vanish mid-edit.
 */
@Composable
internal fun NotesField(notes: String, enabled: Boolean, onChange: (String) -> Unit) {
    var open by rememberSaveable { mutableStateOf(notes.isNotEmpty()) }
    if (!open && notes.isEmpty()) {
        TextButton(
            onClick = { open = true },
            enabled = enabled,
            contentPadding = PaddingValues(horizontal = PlanrSpacing.sm),
        ) {
            Text(stringResource(R.string.quickadd_add_notes))
        }
        return
    }
    // Focus only when the user asked for the field, not when shared text opened it.
    val focus = remember { FocusRequester() }
    val asked = rememberSaveable { notes.isEmpty() }
    LaunchedEffect(Unit) { if (asked) focus.requestFocus() }
    OutlinedTextField(
        value = notes,
        onValueChange = onChange,
        enabled = enabled,
        label = { Text(stringResource(R.string.quickadd_notes)) },
        minLines = 2,
        maxLines = 6,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        modifier = Modifier
            .fillMaxWidth()
            .focusRequester(focus),
    )
}

@Composable
private fun Labeled(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

/** Shortcut chips plus a date picker; a picked day other than today/tomorrow shows as its own chip. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DateChoices(
    selected: LocalDate?,
    today: LocalDate,
    tomorrow: LocalDate,
    enabled: Boolean,
    allowNone: Boolean,
    onSelect: (LocalDate?) -> Unit,
) {
    var picking by rememberSaveable { mutableStateOf(false) }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        if (allowNone) Choice(selected == null, enabled, stringResource(R.string.quickadd_no_due)) { onSelect(null) }
        Choice(selected == today, enabled, stringResource(R.string.quickadd_today)) { onSelect(today) }
        Choice(selected == tomorrow, enabled, stringResource(R.string.quickadd_tomorrow)) { onSelect(tomorrow) }
        val custom = selected != null && selected != today && selected != tomorrow
        Choice(
            selected = custom,
            enabled = enabled,
            label = if (custom) formatDayMonth(selected!!, currentLocale()) else stringResource(R.string.quickadd_pick_date),
        ) { picking = true }
    }
    if (picking) {
        DatePickerSheet(
            initial = selected ?: today,
            onPick = {
                onSelect(it)
                picking = false
            },
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun Choice(selected: Boolean, enabled: Boolean, label: String, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        enabled = enabled,
        label = { Text(label) },
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer),
    )
}

@Composable
private fun TimeButton(time: LocalTime, enabled: Boolean, onPick: (LocalTime) -> Unit, suffix: String? = null) {
    var picking by rememberSaveable { mutableStateOf(false) }
    val is24Hour = is24HourClock()
    OutlinedButton(onClick = { picking = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text(formatTime(time, is24Hour, currentLocale()), style = PlanrTheme.type.timeMedium)
        suffix?.let {
            Text(
                text = " · $it",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    if (picking) {
        TimePickerDialog(
            initial = time,
            is24Hour = is24Hour,
            onPick = {
                onPick(it)
                picking = false
            },
            onDismiss = { picking = false },
        )
    }
}
