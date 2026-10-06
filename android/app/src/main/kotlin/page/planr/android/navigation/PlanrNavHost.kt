package page.planr.android.navigation

import android.widget.Toast
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.datetime.LocalDate
import page.planr.android.account.AccountMenuButton
import page.planr.android.feature.agenda.navigation.agendaGraph
import page.planr.android.feature.insights.insightsScreen
import page.planr.android.feature.quickadd.QuickAddKind
import page.planr.android.feature.quickadd.QuickAddSheet
import page.planr.android.feature.tasks.navigateToTask
import page.planr.android.feature.tasks.taskDetailScreen
import page.planr.android.feature.tasks.tasksScreen
import page.planr.android.signin.SignInScreen
import page.planr.android.feature.quickadd.R as QuickAddR

/**
 * App navigation. Signed out, only sign-in; signed in, the Agenda, Tasks and
 * Insights tabs (bottom bar on their roots, hidden on detail screens) with
 * Quick add behind the floating button of the tabs that have one. The agenda is always the root of the
 * signed-in back stack, so switching tabs saves and restores each tab's stack
 * against it. Losing the session (the account menu's "Sign out", or a
 * refresh token the server rejected) clears the back stack back to sign-in.
 * Tapping the tab already showing goes back to its root, or on the root to
 * today (agenda) or the top of the list (tasks); see [reTapAction].
 *
 * @param launchRoute a widget's requested destination, or the import review
 *   for a file opened in or shared to the app; opened once signed in,
 *   then reported through [onLaunchRouteHandled] (also when it was dropped
 *   because nobody is signed in).
 * @param onOpenDay asks the agenda to show a day (a widget's [LaunchRoute.Day]).
 */
@Composable
fun PlanrNavHost(
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    launchRoute: LaunchRoute? = null,
    onLaunchRouteHandled: () -> Unit = {},
    onOpenDay: (LocalDate) -> Unit = {},
) {
    val navController = rememberNavController()
    // Fixed for the graph's lifetime; later auth changes navigate instead.
    val startDestination = remember { if (signedIn) PlanrRoutes.AGENDA else PlanrRoutes.SIGN_IN }
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentTab = TopLevelTab.ofRoute(backStackEntry?.destination?.route)
    var quickAdd by rememberSaveable { mutableStateOf<QuickAddKind?>(null) }
    // The account menu read a picked .ics file into IcsImportRequests: review it.
    val openImport: () -> Unit = remember(navController) { { navController.open(LaunchRoute.Import) } }
    // One-shot re-tap signals; dropped when the screen isn't there to take them.
    val agendaToday = remember { MutableSharedFlow<Unit>(extraBufferCapacity = 1) }
    val tasksToTop = remember { MutableSharedFlow<Unit>(extraBufferCapacity = 1) }
    val backDispatcher = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    val onSelectTab: (TopLevelTab) -> Unit = { tab ->
        val shown = shownTab { route -> navController.hasOnStack(route) }
        when (reTapAction(tab, shown, navController.currentDestination?.route)) {
            null -> navController.selectTab(tab)
            ReTapAction.PopToRoot -> navController.popBackStack(tab.route, inclusive = false)
            ReTapAction.DispatchBack -> backDispatcher?.onBackPressed()
            ReTapAction.GoToday -> agendaToday.tryEmit(Unit)
            ReTapAction.ScrollToTop -> tasksToTop.tryEmit(Unit)
            ReTapAction.None -> Unit
        }
    }

    LaunchedEffect(signedIn) {
        if (!signedIn) {
            quickAdd = null
            if (navController.currentDestination?.route != PlanrRoutes.SIGN_IN) {
                navController.navigate(PlanrRoutes.SIGN_IN) {
                    popUpTo(navController.graph.id) { inclusive = true }
                    launchSingleTop = true
                }
            }
        }
    }
    LaunchedEffect(launchRoute, signedIn) {
        val target = launchRoute ?: return@LaunchedEffect
        if (signedIn) {
            navController.open(target)
            if (target is LaunchRoute.Day) onOpenDay(target.date)
        }
        onLaunchRouteHandled()
    }

    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (signedIn && currentTab != null) {
                PlanrBottomBar(current = currentTab, onSelect = onSelectTab)
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            // The Scaffold covers the status bar and bottom bar; the rest
            // (keyboard, cutouts) is left to safe-drawing padding.
            modifier = Modifier
                .padding(padding)
                .consumeWindowInsets(padding)
                .safeDrawingPadding(),
        ) {
            composable(PlanrRoutes.SIGN_IN) {
                SignInScreen(
                    onSignedIn = {
                        navController.navigate(PlanrRoutes.AGENDA) {
                            popUpTo(PlanrRoutes.SIGN_IN) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                )
            }
            agendaGraph(
                navController,
                onQuickAdd = { quickAdd = TopLevelTab.Agenda.quickAddKind },
                accountAction = { AccountMenuButton(onImportIcs = openImport) },
                todayRequests = agendaToday,
            )
            tasksScreen(
                onOpenTask = { id -> navController.navigateToTask(id) },
                onNewTask = { quickAdd = TopLevelTab.Tasks.quickAddKind },
                accountAction = { AccountMenuButton(onImportIcs = openImport) },
                scrollToTopRequests = tasksToTop,
            )
            taskDetailScreen(onBack = { navController.popBackStack() })
            insightsScreen(
                onOpenDay = { date ->
                    // selectTab saves the Insights stack (its ViewModel and saved state),
                    // unlike open(), so coming back keeps the period and tab.
                    navController.selectTab(TopLevelTab.Agenda)
                    onOpenDay(date)
                },
                onOpenAgenda = { navController.selectTab(TopLevelTab.Agenda) },
                onOpenTasks = { navController.selectTab(TopLevelTab.Tasks) },
                accountAction = { AccountMenuButton(onImportIcs = openImport) },
            )
        }
    }

    quickAdd?.let { kind ->
        val context = LocalContext.current
        QuickAddSheet(
            kind = kind,
            onDismiss = { quickAdd = null },
            onSaved = { saved -> Toast.makeText(context, savedMessage(saved), Toast.LENGTH_SHORT).show() },
        )
    }
}

/** Switches tabs, keeping each tab's own back stack (agenda is the root of both). */
private fun NavController.selectTab(tab: TopLevelTab) {
    navigate(tab.route) {
        popUpTo(PlanrRoutes.AGENDA) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/** Whether [route] is on the back stack. */
private fun NavController.hasOnStack(route: String): Boolean =
    runCatching { getBackStackEntry(route) }.isSuccess

/**
 * Opens a widget's target on a fresh stack of its tab (no restored detail
 * screens underneath), then pushes the detail, so Back returns to the tab.
 *
 * Over an editor ([isEditorRoute]) nothing is popped, so its draft survives:
 * a detail target is pushed on top (Back returns to the editor), and a bare
 * tab target leaves the editor where it is.
 */
private fun NavController.open(target: LaunchRoute) {
    val detail = when (target) {
        is LaunchRoute.Tab, is LaunchRoute.Day -> null
        is LaunchRoute.Event -> target.route
        is LaunchRoute.Task -> target.route
        is LaunchRoute.Import -> target.route
    }
    if (isEditorRoute(currentDestination?.route)) {
        if (detail != null) runCatching { navigate(detail) }
        return
    }
    navigate(target.tab.route) {
        popUpTo(PlanrRoutes.AGENDA)
        launchSingleTop = true
    }
    if (detail != null) {
        try {
            navigate(detail)
        } catch (_: IllegalArgumentException) {
            // A malformed id that slipped past parsing: stay on the tab.
        }
    }
}

private fun savedMessage(kind: QuickAddKind): Int = when (kind) {
    QuickAddKind.Task -> QuickAddR.string.quickadd_task_created
    QuickAddKind.Event -> QuickAddR.string.quickadd_event_created
}
