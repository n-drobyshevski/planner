package page.planr.android.feature.tasks.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import kotlinx.datetime.LocalDate
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.model.TaskPriority
import page.planr.android.feature.tasks.R
import page.planr.android.feature.tasks.model.TaskForm
import page.planr.android.feature.tasks.ui.MemberAvatar
import page.planr.android.feature.tasks.ui.currentLocale
import page.planr.android.feature.tasks.ui.formatDayMonth
import page.planr.android.feature.tasks.ui.pickerMillisToDate
import page.planr.android.feature.tasks.ui.priorityLabel
import page.planr.android.feature.tasks.ui.taskColor
import page.planr.android.feature.tasks.ui.toPickerMillis

/** The task fields, editable for the owner and disabled (read-only) for the partner. */
@Composable
internal fun TaskEditor(state: TaskDetailUiState, form: TaskForm, viewModel: TaskDetailViewModel) {
    val enabled = state.canEdit && !state.saving

    if (!state.canEdit) {
        Text(
            text = stringResource(R.string.task_detail_read_only, state.owner?.name.orEmpty()),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    state.parent?.let { parent ->
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
            Icon(
                painterResource(R.drawable.ic_task_subtask),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(R.string.task_subtask_of, parent.title),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    OutlinedTextField(
        value = form.title,
        onValueChange = viewModel::setTitle,
        enabled = enabled,
        label = { Text(stringResource(R.string.task_field_title)) },
        placeholder = { Text(stringResource(R.string.task_field_title_placeholder)) },
        isError = !form.isTitleValid,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        modifier = Modifier.fillMaxWidth(),
    )

    Field(stringResource(R.string.task_field_status)) { StatusPicker(state, form, enabled, viewModel) }

    Field(stringResource(R.string.task_field_due)) {
        DueDatePicker(form.dueDate, overdue = state.overdue, enabled = enabled, onChange = viewModel::setDueDate)
    }

    Field(stringResource(R.string.task_field_priority)) {
        val levels = TaskPriority.entries
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            levels.forEachIndexed { index, level ->
                SegmentedButton(
                    selected = form.priority == level,
                    onClick = { viewModel.setPriority(level) },
                    enabled = enabled,
                    shape = SegmentedButtonDefaults.itemShape(index, levels.size),
                    icon = {},
                    label = { Text(priorityLabel(level), maxLines = 1) },
                )
            }
        }
    }

    Field(stringResource(R.string.task_field_assignee)) { AssigneePicker(state, form, enabled, viewModel) }

    Field(stringResource(R.string.task_field_context)) { ContextPicker(state, form, enabled, viewModel) }

    OutlinedTextField(
        value = form.notes,
        onValueChange = viewModel::setNotes,
        enabled = enabled,
        label = { Text(stringResource(R.string.task_field_notes)) },
        placeholder = { Text(stringResource(R.string.task_field_notes_placeholder)) },
        minLines = 3,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        modifier = Modifier.fillMaxWidth(),
    )

    if (state.subtasks.isNotEmpty()) SubtaskList(state)
}

@Composable
private fun Field(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
    }
}

/**
 * The collection's columns (the web's "Column"). A task without columns shows
 * its status read-only: completion is the board, so there is nothing to pick.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatusPicker(state: TaskDetailUiState, form: TaskForm, enabled: Boolean, viewModel: TaskDetailViewModel) {
    if (state.boards.isNotEmpty()) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
            state.boards.forEach { board ->
                Chip(
                    selected = form.boardId == board.id,
                    enabled = enabled,
                    label = board.name,
                    onClick = { viewModel.setBoard(board) },
                )
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
            Text(
                text = stringResource(if (form.done) R.string.task_status_done else R.string.task_status_open),
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = stringResource(R.string.task_status_no_columns),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DueDatePicker(date: LocalDate?, overdue: Boolean, enabled: Boolean, onChange: (LocalDate?) -> Unit) {
    var picking by rememberSaveable { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        val tone = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
        OutlinedButton(onClick = { picking = true }, enabled = enabled) {
            Icon(
                painterResource(if (overdue) R.drawable.ic_task_calendar_overdue else R.drawable.ic_task_calendar),
                contentDescription = null,
                tint = tone,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = date?.let { formatDayMonth(it, currentLocale()) } ?: stringResource(R.string.task_field_no_due),
                color = tone,
                fontWeight = if (overdue) FontWeight.Medium else FontWeight.Normal,
                modifier = Modifier.padding(start = PlanrSpacing.sm),
            )
        }
        if (date != null && enabled) {
            TextButton(onClick = { onChange(null) }) { Text(stringResource(R.string.task_field_clear)) }
        }
    }
    if (picking) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = date?.toPickerMillis())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { onChange(pickerMillisToDate(it)) }
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AssigneePicker(state: TaskDetailUiState, form: TaskForm, enabled: Boolean, viewModel: TaskDetailViewModel) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Chip(
            selected = form.assigneeId == null,
            enabled = enabled,
            label = stringResource(R.string.task_field_unassigned),
            onClick = { viewModel.setAssignee(null) },
        )
        state.members.forEach { member ->
            Chip(
                selected = form.assigneeId == member.id,
                enabled = enabled,
                label = member.name,
                onClick = { viewModel.setAssignee(member.id) },
                leading = { MemberAvatar(member, size = 18.dp) },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContextPicker(state: TaskDetailUiState, form: TaskForm, enabled: Boolean, viewModel: TaskDetailViewModel) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Chip(
            selected = form.categoryId == null,
            enabled = enabled,
            label = stringResource(R.string.task_field_no_context),
            onClick = { viewModel.setCategory(null) },
        )
        state.categories.forEach { category ->
            Chip(
                selected = form.categoryId == category.id,
                enabled = enabled,
                label = category.name,
                onClick = { viewModel.setCategory(category.id) },
                leading = { ColorDot(category.color) },
            )
        }
    }
}

@Composable
private fun Chip(
    selected: Boolean,
    enabled: Boolean,
    label: String,
    onClick: () -> Unit,
    leading: (@Composable () -> Unit)? = null,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        enabled = enabled,
        label = { Text(label) },
        leadingIcon = leading,
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
        ),
    )
}

@Composable
private fun ColorDot(hex: String) {
    Box(
        Modifier
            .size(10.dp)
            .background(taskColor(hex), CircleShape),
    )
}

/** Subtasks, read-only on mobile: done state, title, and the subtree progress. */
@Composable
private fun SubtaskList(state: TaskDetailUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
            Text(
                text = stringResource(R.string.task_subtasks_title),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.semantics { heading() },
            )
            state.progress?.let {
                Text(
                    text = pluralStringResource(R.plurals.task_subtasks_progress, it.total, it.done, it.total),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        state.subtasks.forEach { subtask ->
            val done = subtask.completedAt != null
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
            ) {
                Box(
                    modifier = Modifier
                        .size(18.dp)
                        .background(
                            if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                            MaterialTheme.shapes.extraSmall,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    if (done) {
                        Icon(
                            painterResource(R.drawable.ic_task_check),
                            contentDescription = stringResource(R.string.task_status_done),
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(12.dp),
                        )
                    }
                }
                Text(
                    text = subtask.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    textDecoration = if (done) TextDecoration.LineThrough else null,
                )
            }
        }
    }
}
