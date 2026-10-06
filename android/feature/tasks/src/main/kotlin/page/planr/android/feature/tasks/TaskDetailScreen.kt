package page.planr.android.feature.tasks

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import page.planr.android.core.design.component.DiscardChangesDialog
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.component.rememberPlanrHaptics
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.tasks.detail.TaskDetailNotice
import page.planr.android.feature.tasks.detail.TaskDetailUiState
import page.planr.android.feature.tasks.detail.TaskDetailViewModel
import page.planr.android.feature.tasks.detail.TaskEditor

/**
 * One task: its fields as an editor for the owner (title, notes, status, due,
 * priority, assignee, context) or read-only for the partner, plus its
 * subtasks (read-only on mobile). Save writes only the changed fields and is
 * rejected, not merged, if the task changed elsewhere meanwhile. Leaving with
 * unsaved changes (Back or the top bar) asks to discard them first.
 */
@Composable
fun TaskDetailScreen(
    taskId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: TaskDetailViewModel = hiltViewModel<TaskDetailViewModel, TaskDetailViewModel.Factory>(
        key = taskId,
        creationCallback = { factory -> factory.create(taskId) },
    ),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    val leave: () -> Unit = {
        if (state.dirty) {
            confirmingDiscard = true
        } else {
            onBack()
        }
    }

    LaunchedEffect(state.saved) { if (state.saved) onBack() }
    NoticeEffect(state.notice, snackbar, viewModel::dismissNotice)
    BackHandler(enabled = state.dirty) { confirmingDiscard = true }

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = { DetailTopBar(state, leave, viewModel::save) },
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
}

@Composable
private fun DetailTopBar(state: TaskDetailUiState, onBack: () -> Unit, onSave: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = PlanrSpacing.xs, vertical = PlanrSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
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
            TextButton(onClick = onSave, enabled = state.dirty && !state.saving) {
                Text(stringResource(if (state.saving) R.string.task_detail_saving else R.string.task_detail_save))
            }
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
