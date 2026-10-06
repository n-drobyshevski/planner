package page.planr.android.feature.inbox

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/** The Inbox route; the same string as the app's `PlanrRoutes.INBOX`. */
object InboxDestinations {
    const val ROUTE = "inbox"
}

/** The Inbox, opened from the account menu; [onBack] leaves it. */
fun NavGraphBuilder.inboxScreen(onBack: () -> Unit) {
    composable(InboxDestinations.ROUTE) {
        InboxScreen(onBack = onBack)
    }
}
