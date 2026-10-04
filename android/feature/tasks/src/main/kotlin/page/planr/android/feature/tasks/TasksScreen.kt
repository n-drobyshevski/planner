package page.planr.android.feature.tasks

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.component.PlaceholderScreen

/** Tasks list with filters. Placeholder until Phase 4. */
@Composable
fun TasksScreen(
    onOpenTask: (taskId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    PlaceholderScreen(
        title = stringResource(R.string.tasks_empty_title),
        body = stringResource(R.string.tasks_empty_body),
        modifier = modifier,
    )
}
