package page.planr.android.feature.tasks

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.component.PlaceholderScreen

/** Task detail/edit and completion. Placeholder until Phase 4. */
@Composable
fun TaskDetailScreen(
    taskId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PlaceholderScreen(
        title = stringResource(R.string.task_detail_title),
        body = taskId,
        modifier = modifier,
    )
}
