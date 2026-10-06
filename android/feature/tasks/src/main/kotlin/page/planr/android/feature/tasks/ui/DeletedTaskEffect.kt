package page.planr.android.feature.tasks.ui

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.flow.Flow
import page.planr.android.core.design.component.rememberPlanrHaptics
import page.planr.android.feature.tasks.R
import page.planr.android.feature.tasks.detail.TaskDeleted

/**
 * "Task deleted · Undo" for a delete made in a detail that has since closed.
 * Collected only while this screen is started, so the screen the user lands
 * on is the one that shows it.
 */
@Composable
internal fun DeletedTaskEffect(deleted: Flow<TaskDeleted>, snackbar: SnackbarHostState, onUndo: (TaskDeleted) -> Unit) {
    val message = stringResource(R.string.task_deleted)
    val undo = stringResource(R.string.task_undo)
    val haptics = rememberPlanrHaptics()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(deleted, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            deleted.collect { task ->
                val result = snackbar.showSnackbar(message, actionLabel = undo, duration = SnackbarDuration.Long)
                if (result == SnackbarResult.ActionPerformed) {
                    haptics.tick()
                    onUndo(task)
                }
            }
        }
    }
}
