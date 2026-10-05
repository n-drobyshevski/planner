package page.planr.android.feature.insights.tasks

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import page.planr.android.feature.insights.model.TasksModel
import page.planr.android.feature.insights.model.TabEnv

/** The Tasks tab: a LazyColumn whose first item is always [header]. */
@Composable
fun TasksTab(
    model: TasksModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    onOpenTasks: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TODO("T4")
}
