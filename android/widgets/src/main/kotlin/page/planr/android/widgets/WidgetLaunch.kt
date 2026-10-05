package page.planr.android.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * How a widget tap opens the app. Every tap is an explicit intent to the app's
 * launcher activity with [ACTION_OPEN] and, optionally, [EXTRA_ROUTE]: one of
 * the app's navigation routes (`agenda`, `tasks`, `event/{ref}`, `task/{id}`,
 * the strings of `PlanrRoutes`). The activity reads it with [routeOf] in
 * `onCreate` and `onNewIntent` and navigates there once signed in; with no
 * route (or signed out) it simply opens where it would anyway.
 */
object WidgetLaunch {
    const val ACTION_OPEN = "page.planr.android.widgets.action.OPEN"
    const val EXTRA_ROUTE = "page.planr.android.widgets.extra.ROUTE"

    /** The route a widget asked for, or null when [intent] didn't come from a widget. */
    fun routeOf(intent: Intent?): String? =
        intent?.takeIf { it.action == ACTION_OPEN }?.getStringExtra(EXTRA_ROUTE)

    internal const val ROUTE_AGENDA = "agenda"
    internal const val ROUTE_TASKS = "tasks"

    /** An occurrence key (`eventId` or `eventId:epochMs`), as the agenda's detail route takes. */
    internal fun eventRoute(occurrenceKey: String): String = "event/${Uri.encode(occurrenceKey)}"

    internal fun taskRoute(taskId: String): String = "task/${Uri.encode(taskId)}"

    /** Opens the app (its launcher activity) on [route], or where it would open anyway. */
    internal fun openApp(context: Context, route: String? = null): Intent {
        val launcher = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent().setPackage(context.packageName)
        return Intent(ACTION_OPEN)
            .setComponent(launcher.component)
            .setPackage(context.packageName)
            .apply { if (route != null) putExtra(EXTRA_ROUTE, route) }
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}
