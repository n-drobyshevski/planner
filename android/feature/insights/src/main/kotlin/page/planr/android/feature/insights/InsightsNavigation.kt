package page.planr.android.feature.insights

import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import kotlinx.datetime.LocalDate

/** The Insights route; the same string as the app's `PlanrRoutes.INSIGHTS`. */
object InsightsDestinations {
    const val ROUTE = "insights"
}

/**
 * The Insights tab. [onOpenDay] shows a day in the agenda (the day sheet's
 * "Open in calendar"); [onOpenAgenda] / [onOpenTasks] back the empty states'
 * calls to action; [accountAction] is the host's account menu.
 */
fun NavGraphBuilder.insightsScreen(
    onOpenDay: (LocalDate) -> Unit,
    onOpenAgenda: () -> Unit,
    onOpenTasks: () -> Unit,
    accountAction: (@Composable () -> Unit)? = null,
) {
    composable(InsightsDestinations.ROUTE) {
        InsightsScreen(onOpenDay, onOpenAgenda, onOpenTasks, accountAction)
    }
}
