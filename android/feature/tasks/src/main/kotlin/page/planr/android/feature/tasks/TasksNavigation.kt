package page.planr.android.feature.tasks

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavOptionsBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** Routes of the tasks screens; the same strings as the app's `PlanrRoutes.TASKS` / `TASK`. */
object TasksDestinations {
    const val LIST = "tasks"
    const val ARG_ID = "id"
    const val DETAIL = "task/{$ARG_ID}"

    fun detail(taskId: String): String = "task/${Uri.encode(taskId)}"
}

/**
 * The tasks list destination. [onNewTask] adds a "New task" button (e.g.
 * opening Quick add); [accountAction] is the host's account menu; each
 * [scrollToTopRequests] emission scrolls the list to the top.
 */
fun NavGraphBuilder.tasksScreen(
    onOpenTask: (taskId: String) -> Unit,
    onNewTask: (() -> Unit)? = null,
    accountAction: (@Composable () -> Unit)? = null,
    scrollToTopRequests: Flow<Unit> = emptyFlow(),
) {
    composable(TasksDestinations.LIST) {
        TasksScreen(
            onOpenTask = onOpenTask,
            onNewTask = onNewTask,
            accountAction = accountAction,
            scrollToTopRequests = scrollToTopRequests,
        )
    }
}

/** The task detail/edit destination (`task/{id}`). */
fun NavGraphBuilder.taskDetailScreen(onBack: () -> Unit) {
    composable(
        route = TasksDestinations.DETAIL,
        arguments = listOf(navArgument(TasksDestinations.ARG_ID) { type = NavType.StringType }),
    ) { entry ->
        TaskDetailScreen(
            taskId = entry.arguments?.getString(TasksDestinations.ARG_ID).orEmpty(),
            onBack = onBack,
        )
    }
}

fun NavController.navigateToTask(taskId: String, builder: NavOptionsBuilder.() -> Unit = {}) =
    navigate(TasksDestinations.detail(taskId), builder)
