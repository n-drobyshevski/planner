package page.planr.android.navigation

import kotlinx.datetime.LocalDate
import page.planr.android.feature.agenda.navigation.AgendaRoutes

/**
 * Where an external launch (a widget or notification tap, an .ics file
 * opened in or shared to the app) asked the app to open. MainActivity is
 * exported, so a launch's route is untrusted input: only the shapes the
 * widgets and notifications produce are accepted ([parse]), anything else
 * opens the app as is. [Import] is never parsed from a route: the activity
 * sets it once it has read a file.
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

    /** One day in the agenda's day view. */
    data class Day(val date: LocalDate) : LaunchRoute {
        override val tab get() = TopLevelTab.Agenda
    }

    /** The .ics import review, for the file just handed to `IcsImportRequests`. */
    data object Import : LaunchRoute {
        override val tab get() = TopLevelTab.Agenda
        val route get() = AgendaRoutes.IMPORT
    }

    /** The Inbox (a "Time requests" notification), over the agenda as the account menu opens it. */
    data object Inbox : LaunchRoute {
        override val tab get() = TopLevelTab.Agenda
        val route get() = PlanrRoutes.INBOX
    }

    /** A task; [encodedId] stays URI-encoded. */
    data class Task(val encodedId: String) : LaunchRoute {
        override val tab get() = TopLevelTab.Tasks
        val route get() = "task/$encodedId"
    }

    companion object {
        private const val EVENT_PREFIX = "event/"
        private const val TASK_PREFIX = "task/"
        private const val DAY_PREFIX = "day/"
        private val ISO_DATE = Regex("""\d{4}-\d{2}-\d{2}""")

        /**
         * Parses a widget or notification route (`agenda`, `tasks`, `inbox`,
         * `event/{ref}`, `task/{id}`, `day/{yyyy-mm-dd}`); null when unknown.
         */
        fun parse(route: String?): LaunchRoute? = when {
            route == null -> null
            route == PlanrRoutes.AGENDA -> Tab(TopLevelTab.Agenda)
            route == PlanrRoutes.TASKS -> Tab(TopLevelTab.Tasks)
            route == PlanrRoutes.INBOX -> Inbox
            route.startsWith(EVENT_PREFIX) -> segment(route, EVENT_PREFIX)?.let(::Event)
            route.startsWith(TASK_PREFIX) -> segment(route, TASK_PREFIX)?.let(::Task)
            route.startsWith(DAY_PREFIX) -> date(route.removePrefix(DAY_PREFIX))?.let(::Day)
            else -> null
        }

        /** An ISO calendar date, and only that (no time, no offset); null when invalid. */
        private fun date(value: String): LocalDate? =
            if (ISO_DATE.matches(value)) runCatching { LocalDate.parse(value) }.getOrNull() else null

        /** The single path segment after [prefix]: non-empty, and no nested path or query. */
        private fun segment(route: String, prefix: String): String? =
            route.removePrefix(prefix).takeIf { it.isNotEmpty() && it.none { c -> c in "/?#" } }
    }
}

/**
 * Routes that hold an unsaved draft: the event editor (existing or new), the
 * task detail, which edits in place, and the .ics import review. A launch
 * from outside must not pop them.
 */
internal fun isEditorRoute(route: String?): Boolean =
    route == AgendaRoutes.EVENT_EDIT ||
        route == AgendaRoutes.EVENT_NEW ||
        route == AgendaRoutes.IMPORT ||
        route == PlanrRoutes.TASK
