package page.planr.android.feature.tasks.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import kotlinx.datetime.LocalDate
import page.planr.android.core.data.attributes.AttributeKey
import page.planr.android.core.design.component.AttributeDetails
import page.planr.android.core.design.component.AttributeScale
import page.planr.android.core.design.component.rememberPlanrHaptics
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

/**
 * The task fields (with the optional optimization details), editable for the
 * owner and disabled (read-only) for the partner, then the subtasks and the
 * task's calendar blocks. [onOpenTask] opens another task's detail (a
 * subtask, or the parent from the "Subtask of" line); [onOpenEvent] opens a
 * block's event.
 */
@Composable
internal fun TaskEditor(
    state: TaskDetailUiState,
    form: TaskForm,
    viewModel: TaskDetailViewModel,
    onOpenTask: (taskId: String) -> Unit,
    onOpenEvent: (eventId: String) -> Unit,
) {
    val enabled = state.canEdit && !state.saving

    if (!state.canEdit) {
        Text(
            text = stringResource(R.string.task_detail_read_only, state.owner?.name.orEmpty()),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    state.parent?.let { parent ->
        val openParent = stringResource(R.string.task_subtask_open_parent)
        Row(
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clip(MaterialTheme.shapes.small)
                // Not mid-write: the save or delete closes this screen once it lands.
                .clickable(enabled = !state.saving && !state.deleting, onClickLabel = openParent) { onOpenTask(parent.id) },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            Icon(
                painterResource(R.drawable.ic_task_subtask),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(R.string.task_subtask_of, parent.title.ifBlank { stringResource(R.string.task_detail_untitled) }),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textDecoration = TextDecoration.Underline,
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

    AttributeDetails(
        scales = AttributeScales,
        selected = form.attributes.mapKeys { it.key.key },
        onSelect = { key, option -> AttributeKey.of(key)?.let { viewModel.setAttribute(it, option) } },
        enabled = enabled,
    )

    if (state.subtasks.isNotEmpty() || state.canAddSubtask) SubtaskList(state, viewModel, onOpenTask)

    if (state.blocks.isNotEmpty() || state.canSchedule) {
        TaskBlocksSection(
            state = state,
            onOpenEvent = onOpenEvent,
            onRemove = viewModel::removeBlock,
            onAdd = viewModel::openBlockSheet,
        )
    }
}

/** The known attributes, as the shared details editor shows them. */
private val AttributeScales = AttributeKey.entries.map { AttributeScale(it.key, it.options) }

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

/**
 * Subtasks with the subtree progress: the checkbox completes or reopens one
 * (owner only; under a sequential parent only the next one), tapping the
 * row opens it, and the owner adds one from the field at the end (not on
 * the deepest level, which can't have subtasks).
 */
@Composable
private fun SubtaskList(state: TaskDetailUiState, viewModel: TaskDetailViewModel, onOpenTask: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
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
        state.subtasks.forEach { item ->
            SubtaskRow(
                item = item,
                canOpen = !state.saving && !state.deleting,
                onToggle = { viewModel.toggleSubtask(item.task.id) },
                onOpen = { onOpenTask(item.task.id) },
            )
        }
        if (state.canAddSubtask) {
            AddSubtaskField(
                value = state.subtaskTitle,
                enabled = !state.saving && !state.deleting,
                adding = state.addingSubtask,
                onValueChange = viewModel::setSubtaskTitle,
                onAdd = viewModel::addSubtask,
            )
        }
    }
}

@Composable
private fun SubtaskRow(item: SubtaskItem, canOpen: Boolean, onToggle: () -> Unit, onOpen: () -> Unit) {
    val haptics = rememberPlanrHaptics()
    val openLabel = stringResource(R.string.task_subtask_open)
    val toggleLabel = stringResource(if (item.done) R.string.task_card_mark_not_done else R.string.task_card_mark_done)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(MaterialTheme.shapes.small)
            .clickable(enabled = canOpen, onClickLabel = openLabel, onClick = onOpen),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = item.done,
            onCheckedChange = { done ->
                if (done) haptics.confirm() else haptics.tick()
                onToggle()
            },
            enabled = item.canToggle && !item.pending,
            colors = CheckboxDefaults.colors(checkedColor = MaterialTheme.colorScheme.primary),
            modifier = Modifier
                .size(PlanrSpacing.touchTarget)
                .semantics { contentDescription = toggleLabel },
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = PlanrSpacing.xs, end = PlanrSpacing.sm, top = PlanrSpacing.xs, bottom = PlanrSpacing.xs),
        ) {
            Text(
                text = item.task.title.ifBlank { stringResource(R.string.task_detail_untitled) },
                style = MaterialTheme.typography.bodyMedium,
                color = if (item.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                textDecoration = if (item.done) TextDecoration.LineThrough else null,
            )
            if (item.blocked) {
                Text(
                    text = stringResource(R.string.task_subtask_blocked),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** "Add a subtask": the keyboard's Done (or the + button) creates it and clears the field for the next. */
@Composable
private fun AddSubtaskField(
    value: String,
    enabled: Boolean,
    adding: Boolean,
    onValueChange: (String) -> Unit,
    onAdd: () -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = true,
        placeholder = { Text(stringResource(R.string.task_subtask_add_placeholder)) },
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onAdd() }),
        trailingIcon = {
            IconButton(onClick = onAdd, enabled = enabled && !adding && value.isNotBlank()) {
                Icon(
                    painterResource(R.drawable.ic_task_add),
                    contentDescription = stringResource(R.string.task_subtask_add),
                    modifier = Modifier.size(20.dp),
                )
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = PlanrSpacing.xs),
    )
}
