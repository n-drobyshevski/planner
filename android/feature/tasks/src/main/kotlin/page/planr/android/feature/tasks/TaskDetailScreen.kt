package page.planr.android.feature.tasks

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlin.coroutines.cancellation.CancellationException
import page.planr.android.core.design.component.DiscardChangesDialog
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.component.rememberPlanrHaptics
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.tasks.detail.BlockNotice
import page.planr.android.feature.tasks.detail.BlockSheet
import page.planr.android.feature.tasks.detail.DeletePlan
import page.planr.android.feature.tasks.detail.TaskDetailNotice
import page.planr.android.feature.tasks.detail.TaskDetailUiState
import page.planr.android.feature.tasks.detail.TaskDetailViewModel
import page.planr.android.feature.tasks.detail.TaskEditor
import page.planr.android.feature.tasks.ui.DeletedTaskEffect

/**
 * One task: its fields as an editor for the owner (title, notes, status, due,
 * priority, assignee, context) or read-only for the partner, plus its
 * subtasks (checked off, opened, added). Save writes only the changed fields
 * and is rejected, not merged, if the task changed elsewhere meanwhile.
 * Leaving with unsaved changes (Back or the top bar) asks to discard them
 * first, as does an unsent "Add a subtask" title; while a save, delete or
 * subtask write is in flight Back waits for it (no prompt, and no pop that
 * would cancel the write). Delete is immediate with Undo when nothing goes
 * with the task, and asks first when its subtasks or calendar blocks would. The task's calendar
 * blocks are listed too; the owner adds one from a sheet and removes one,
 * each with Undo. A block write is its own: it leaves the form clean, and
 * Back, Save and Delete wait for it like they wait for a save.
 *
 * @param onOpenTask opens another task's detail (a subtask, or the parent).
 * @param onOpenEvent opens a calendar block's event detail.
 */
@Composable
fun TaskDetailScreen(
    taskId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenTask: (taskId: String) -> Unit = {},
    onOpenEvent: (eventId: String) -> Unit = {},
    viewModel: TaskDetailViewModel = hiltViewModel<TaskDetailViewModel, TaskDetailViewModel.Factory>(
        key = taskId,
        creationCallback = { factory -> factory.create(taskId) },
    ),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    val leave: () -> Unit = {
        when {
            state.holdsBack -> Unit
            state.hasDraft -> confirmingDiscard = true
            else -> onBack()
        }
    }

    // A block or subtask write started while the save was in flight lands first: leaving would cancel it.
    val sideWriting = state.blockWriting || state.subtaskWriting
    LaunchedEffect(state.saved, sideWriting) { if (state.saved && !sideWriting) onBack() }
    LaunchedEffect(state.deleted) { if (state.deleted) onBack() }
    NoticeEffect(state.notice, snackbar, viewModel::dismissNotice)
    DeletedTaskEffect(viewModel.deletedTasks, snackbar, viewModel::undoDelete, viewModel::putBackDeleted)
    BlockNoticeEffect(state.blockNotice, snackbar, viewModel)
    // Held while saving or deleting too: either closes the screen itself once
    // it lands, and a pop meanwhile would cancel the write half-way. Likewise
    // while a calendar block or a subtask (add, check-off, Undo) is written.
    BackHandler(enabled = state.hasDraft || state.holdsBack, onBack = leave)

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = { DetailTopBar(state, leave, viewModel::save, viewModel::delete) },
    ) { padding ->
        val form = state.form
        when {
            state.loading -> Unit
            state.task == null || form == null -> PlaceholderScreen(
                title = stringResource(R.string.task_detail_not_found_title),
                body = stringResource(R.string.task_detail_not_found_body),
                modifier = Modifier.padding(padding),
                action = { TextButton(onClick = onBack) { Text(stringResource(R.string.task_detail_back)) } },
            )
            else -> Column(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.sm),
                verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
            ) {
                TaskEditor(
                    state = state,
                    form = form,
                    viewModel = viewModel,
                    onOpenTask = onOpenTask,
                    onOpenEvent = onOpenEvent,
                )
            }
        }
    }

    if (confirmingDiscard) {
        DiscardChangesDialog(
            onDiscard = {
                confirmingDiscard = false
                onBack()
            },
            onKeepEditing = { confirmingDiscard = false },
        )
    }
    state.blockSheet?.let { sheet ->
        BlockSheet(
            taskTitle = state.task?.title.orEmpty(),
            sheet = sheet,
            onDateChange = viewModel::setBlockDate,
            onStartChange = viewModel::setBlockStart,
            onMinutesChange = viewModel::setBlockMinutes,
            onAdd = viewModel::createBlock,
            onDismiss = viewModel::dismissBlockSheet,
        )
    }
    state.confirmDelete?.let { plan ->
        ConfirmDeleteDialog(
            title = state.task?.title.orEmpty(),
            plan = plan,
            onDelete = viewModel::confirmDelete,
            onCancel = viewModel::dismissDelete,
        )
    }
}

/**
 * Before a delete that cascades: says what goes with the task, and that it
 * can't be undone. Delete is tinted, not a solid red button (DESIGN.md).
 */
@Composable
private fun ConfirmDeleteDialog(title: String, plan: DeletePlan.Confirm, onDelete: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.task_delete_title, title.ifBlank { stringResource(R.string.task_detail_untitled) })) },
        text = {
            Text(
                when {
                    plan.subtasks > 0 && plan.withBlocks ->
                        pluralStringResource(R.plurals.task_delete_body_subtasks_blocks, plan.subtasks, plan.subtasks)
                    plan.subtasks > 0 -> pluralStringResource(R.plurals.task_delete_body_subtasks, plan.subtasks, plan.subtasks)
                    else -> stringResource(R.string.task_delete_body_blocks)
                },
            )
        },
        confirmButton = {
            TextButton(
                onClick = onDelete,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) { Text(stringResource(R.string.task_delete_confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text(stringResource(R.string.task_delete_cancel)) }
        },
    )
}

@Composable
private fun DetailTopBar(state: TaskDetailUiState, onBack: () -> Unit, onSave: () -> Unit, onDelete: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = PlanrSpacing.xs, vertical = PlanrSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack, enabled = !state.holdsBack) {
            Icon(painterResource(R.drawable.ic_task_back), contentDescription = stringResource(R.string.task_detail_back))
        }
        Text(
            text = stringResource(if (state.canEdit) R.string.task_detail_edit_title else R.string.task_detail_title),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier
                .weight(1f)
                .semantics { heading() },
        )
        if (state.canEdit) {
            IconButton(
                onClick = onDelete,
                enabled = !state.holdsBack,
            ) {
                Icon(
                    painterResource(R.drawable.ic_task_delete),
                    contentDescription = stringResource(R.string.task_delete),
                    modifier = Modifier.size(20.dp),
                )
            }
            TextButton(onClick = onSave, enabled = state.dirty && !state.saving && !state.blockWriting && !state.subtaskWriting) {
                Text(stringResource(if (state.saving) R.string.task_detail_saving else R.string.task_detail_save))
            }
        }
    }
}

/** "Added to calendar · Undo" / "Removed from calendar · Undo" after a block write. */
@Composable
private fun BlockNoticeEffect(notice: BlockNotice?, snackbar: SnackbarHostState, viewModel: TaskDetailViewModel) {
    val added = stringResource(R.string.task_block_added)
    val removed = stringResource(R.string.task_block_removed)
    val undo = stringResource(R.string.task_undo)
    val haptics = rememberPlanrHaptics()
    val activity = LocalActivity.current
    LaunchedEffect(notice) {
        if (notice == null) return@LaunchedEffect
        var recreating = false
        try {
            val result = snackbar.showSnackbar(
                message = when (notice) {
                    is BlockNotice.Added -> added
                    is BlockNotice.Removed -> removed
                },
                actionLabel = undo,
                duration = SnackbarDuration.Long,
            )
            if (result == SnackbarResult.ActionPerformed) {
                haptics.tick()
                viewModel.undoBlock(notice)
            }
        } catch (e: CancellationException) {
            recreating = activity?.isChangingConfigurations == true
            throw e
        } finally {
            // Consumed even when cancelled: coming back must not replay an old
            // Undo. Kept only through a recreation (a rotation): the ViewModel
            // survives it, and the recreated screen shows the notice again.
            if (!recreating) viewModel.dismissBlockNotice(notice)
        }
    }
}

@Composable
private fun NoticeEffect(notice: TaskDetailNotice?, snackbar: SnackbarHostState, dismiss: () -> Unit) {
    val stale = stringResource(R.string.task_stale)
    val failed = stringResource(R.string.task_failed)
    val titleRequired = stringResource(R.string.task_field_title_required)
    val haptics = rememberPlanrHaptics()
    LaunchedEffect(notice) {
        val message = when (notice) {
            null -> return@LaunchedEffect
            TaskDetailNotice.Stale -> stale
            TaskDetailNotice.Failed -> failed
            TaskDetailNotice.TitleRequired -> titleRequired
        }
        if (notice != TaskDetailNotice.TitleRequired) haptics.reject()
        snackbar.showSnackbar(message)
        dismiss()
    }
}
