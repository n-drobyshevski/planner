package page.planr.android.navigation

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import page.planr.android.R
import page.planr.android.feature.quickadd.QuickAddKind

/**
 * The bottom bar's destinations. Each may also decide what Quick add opens
 * on: an event from the agenda, a task from the task list.
 */
enum class TopLevelTab(
    val route: String,
    @get:StringRes val label: Int,
    @get:DrawableRes val icon: Int,
    /** What Quick add opens on from this tab; null = no floating button (Insights). */
    val quickAddKind: QuickAddKind?,
) {
    Agenda(PlanrRoutes.AGENDA, R.string.nav_agenda, R.drawable.ic_nav_agenda, QuickAddKind.Event),
    Tasks(PlanrRoutes.TASKS, R.string.nav_tasks, R.drawable.ic_nav_tasks, QuickAddKind.Task),
    Insights(PlanrRoutes.INSIGHTS, R.string.nav_insights, R.drawable.ic_nav_insights, null),
    ;

    companion object {
        /** The tab whose root is [route]; null on detail screens and sign-in. */
        fun ofRoute(route: String?): TopLevelTab? = entries.firstOrNull { it.route == route }
    }
}
