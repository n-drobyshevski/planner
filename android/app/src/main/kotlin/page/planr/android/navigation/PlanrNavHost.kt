package page.planr.android.navigation

import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import page.planr.android.feature.agenda.AgendaScreen
import page.planr.android.feature.agenda.EventDetailScreen
import page.planr.android.feature.tasks.TaskDetailScreen
import page.planr.android.feature.tasks.TasksScreen
import page.planr.android.signin.SignInScreen

/**
 * App navigation graph. Starts at sign-in; Phase 2 skips straight to the agenda
 * when a session is already stored.
 */
@Composable
fun PlanrNavHost(modifier: Modifier = Modifier) {
    val navController = rememberNavController()
    val idArgument = listOf(navArgument(PlanrRoutes.ARG_ID) { type = NavType.StringType })

    NavHost(
        navController = navController,
        startDestination = PlanrRoutes.SIGN_IN,
        modifier = modifier.safeDrawingPadding(),
    ) {
        composable(PlanrRoutes.SIGN_IN) {
            SignInScreen(
                onSignedIn = {
                    navController.navigate(PlanrRoutes.AGENDA) {
                        popUpTo(PlanrRoutes.SIGN_IN) { inclusive = true }
                    }
                },
            )
        }
        composable(PlanrRoutes.AGENDA) {
            AgendaScreen(onOpenEvent = { id -> navController.navigate(PlanrRoutes.event(id)) })
        }
        composable(PlanrRoutes.TASKS) {
            TasksScreen(onOpenTask = { id -> navController.navigate(PlanrRoutes.task(id)) })
        }
        composable(PlanrRoutes.EVENT, arguments = idArgument) { entry ->
            EventDetailScreen(
                eventId = entry.arguments?.getString(PlanrRoutes.ARG_ID).orEmpty(),
                onBack = { navController.popBackStack() },
            )
        }
        composable(PlanrRoutes.TASK, arguments = idArgument) { entry ->
            TaskDetailScreen(
                taskId = entry.arguments?.getString(PlanrRoutes.ARG_ID).orEmpty(),
                onBack = { navController.popBackStack() },
            )
        }
    }
}
