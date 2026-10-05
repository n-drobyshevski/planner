package page.planr.android.navigation

import page.planr.android.feature.agenda.navigation.AgendaRoutes

/**
 * Where an external launch (a widget tap) asked the app to open. MainActivity
 * is exported, so the requested route is untrusted input: only the four
 * shapes the widgets produce are accepted, anything else opens the app as is.
 */
sealed interface LaunchRoute {
    /** The tab the target lives under; the detail (if any) is pushed on top of it. */
    val tab: TopLevelTab

    /** A top-level tab. */
    data class Tab(override val tab: TopLevelTab) : LaunchRoute

    /** An event or one occurrence of a series; [encodedRef] stays URI-encoded. */
    data class Event(val encodedRef: String) : LaunchRoute {
        override val tab get() = TopLevelTab.Agenda
        val route get() = "event/$encodedRef"
    }

    /** A task; [encodedId] stays URI-encoded. */
    data class Task(val encodedId: String) : LaunchRoute {
        override val tab get() = TopLevelTab.Tasks
        val route get() = "task/$encodedId"
    }

    companion object {
        private const val EVENT_PREFIX = "event/"
        private const val TASK_PREFIX = "task/"

        /** Parses a widget route (`agenda`, `tasks`, `event/{ref}`, `task/{id}`); null when unknown. */
        fun parse(route: String?): LaunchRoute? = when {
            route == null -> null
            route == PlanrRoutes.AGENDA -> Tab(TopLevelTab.Agenda)
            route == PlanrRoutes.TASKS -> Tab(TopLevelTab.Tasks)
            route.startsWith(EVENT_PREFIX) -> segment(route, EVENT_PREFIX)?.let(::Event)
            route.startsWith(TASK_PREFIX) -> segment(route, TASK_PREFIX)?.let(::Task)
            else -> null
        }

        /** The single path segment after [prefix]: non-empty, and no nested path or query. */
        private fun segment(route: String, prefix: String): String? =
            route.removePrefix(prefix).takeIf { it.isNotEmpty() && it.none { c -> c in "/?#" } }
    }
}

/**
 * Routes that hold an unsaved draft: the event editor (existing or new) and
 * the task detail, which edits in place. A widget launch must not pop them.
 */
internal fun isEditorRoute(route: String?): Boolean =
    route == AgendaRoutes.EVENT_EDIT || route == AgendaRoutes.EVENT_NEW || route == PlanrRoutes.TASK
