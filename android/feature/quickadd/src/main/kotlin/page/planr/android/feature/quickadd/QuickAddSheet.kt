package page.planr.android.feature.quickadd

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.component.PlaceholderScreen

/**
 * Quick add for a task or an event. Placeholder until Phase 4, when it becomes
 * a modal bottom sheet hosted both in-app and by the widget's translucent activity.
 */
@Composable
fun QuickAddSheet(
    kind: QuickAddKind,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val title = when (kind) {
        QuickAddKind.Task -> stringResource(R.string.quickadd_new_task)
        QuickAddKind.Event -> stringResource(R.string.quickadd_new_event)
    }
    PlaceholderScreen(title = title, body = "", modifier = modifier)
}
