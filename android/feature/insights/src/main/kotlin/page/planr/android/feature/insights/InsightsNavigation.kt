package page.planr.android.feature.insights

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import kotlinx.datetime.LocalDate
import page.planr.android.core.design.component.PlaceholderScreen

/** The Insights route; the same string as the app's `PlanrRoutes.INSIGHTS`. */
object InsightsDestinations {
    const val ROUTE = "insights"
}

/**
 * Off until every Insights package has merged (the integration step removes
 * it). While false, the tab renders a placeholder and no unfinished screen is
 * reachable. Flip it locally for manual checks; never commit `true`.
 */
internal const val INSIGHTS_LIVE = false

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
        if (INSIGHTS_LIVE) {
            InsightsScreen(onOpenDay, onOpenAgenda, onOpenTasks, accountAction)
        } else {
            PlaceholderScreen(
                title = stringResource(R.string.insights_shell_title),
                body = stringResource(R.string.insights_shell_placeholder),
            )
        }
    }
}
