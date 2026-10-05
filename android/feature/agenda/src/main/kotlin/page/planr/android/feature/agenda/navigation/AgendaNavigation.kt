package page.planr.android.feature.agenda.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import kotlin.time.Instant
import page.planr.android.feature.agenda.AgendaScreen
import page.planr.android.feature.agenda.EventDetailScreen
import page.planr.android.feature.agenda.EventEditScreen
import page.planr.android.feature.agenda.EventEditTarget
import page.planr.android.feature.agenda.importics.IcsImportScreen

/**
 * The agenda feature's routes. [AGENDA] and [EVENT] match the app's
 * `PlanrRoutes`, so [agendaGraph] can replace those entries one for one.
 * Event routes take an event id or an occurrence key (`eventId:epochMs`).
 */
object AgendaRoutes {
    const val AGENDA = "agenda"
    const val ARG_ID = "id"
    const val ARG_START = "start"
    const val EVENT = "event/{$ARG_ID}"
    const val EVENT_EDIT = "event-edit/{$ARG_ID}"
    const val EVENT_NEW = "event-new?$ARG_START={$ARG_START}"

    /** The .ics import review, for the file waiting in `IcsImportRequests`. */
    const val IMPORT = "ics-import"

    fun event(ref: String): String = "event/${Uri.encode(ref)}"

    fun editEvent(ref: String): String = "event-edit/${Uri.encode(ref)}"

    /** The new-event editor, optionally seeded with a start time. */
    fun newEvent(start: Instant? = null): String =
        if (start == null) "event-new" else "event-new?$ARG_START=${start.toEpochMilliseconds()}"
}

private val idArgument = listOf(navArgument(AgendaRoutes.ARG_ID) { type = NavType.StringType })

/**
 * The agenda (day / week). [onQuickAdd] adds a floating Quick add button;
 * [accountAction] is the host's account menu in the top bar.
 */
fun NavGraphBuilder.agendaScreen(
    onOpenEvent: (String) -> Unit,
    onCreateEvent: (Instant?) -> Unit,
    onQuickAdd: (() -> Unit)? = null,
    accountAction: (@Composable () -> Unit)? = null,
) {
    composable(AgendaRoutes.AGENDA) {
        AgendaScreen(
            onOpenEvent = onOpenEvent,
            onCreateEvent = onCreateEvent,
            onQuickAdd = onQuickAdd,
            accountAction = accountAction,
        )
    }
}

/** An event / occurrence detail. */
fun NavGraphBuilder.eventDetailScreen(onBack: () -> Unit, onEdit: (String) -> Unit) {
    composable(AgendaRoutes.EVENT, arguments = idArgument) { entry ->
        EventDetailScreen(
            eventId = entry.arguments?.getString(AgendaRoutes.ARG_ID).orEmpty(),
            onBack = onBack,
            onEdit = onEdit,
        )
    }
}

/**
 * The editor, for an existing event / occurrence and for a new event.
 * [onDone] runs after a save, [onClose] when it is closed without one.
 */
fun NavGraphBuilder.eventEditScreens(onDone: () -> Unit, onClose: () -> Unit = onDone) {
    composable(AgendaRoutes.EVENT_EDIT, arguments = idArgument) { entry ->
        EventEditScreen(
            target = EventEditTarget.Existing(entry.arguments?.getString(AgendaRoutes.ARG_ID).orEmpty()),
            onDone = onDone,
            onClose = onClose,
        )
    }
    composable(
        AgendaRoutes.EVENT_NEW,
        arguments = listOf(
            navArgument(AgendaRoutes.ARG_START) {
                type = NavType.LongType
                defaultValue = NO_START
            },
        ),
    ) { entry ->
        val start = entry.arguments?.getLong(AgendaRoutes.ARG_START, NO_START)?.takeIf { it != NO_START }
        EventEditScreen(
            target = EventEditTarget.New(start?.let(Instant::fromEpochMilliseconds)),
            onDone = onDone,
            onClose = onClose,
        )
    }
}

/**
 * The .ics import review. [onDone] runs after an import, [onClose] when it is
 * left without one.
 */
fun NavGraphBuilder.icsImportScreen(onDone: () -> Unit, onClose: () -> Unit = onDone) {
    composable(AgendaRoutes.IMPORT) {
        IcsImportScreen(onDone = onDone, onClose = onClose)
    }
}

/**
 * The whole agenda feature wired to [navController]: agenda → detail → edit,
 * plus new-event ([onQuickAdd] as in [agendaScreen]) and the .ics import review. After a save the editor returns to the agenda (a "this and
 * following" edit can move the instance into a new series, so the detail it
 * came from may no longer exist).
 */
fun NavGraphBuilder.agendaGraph(
    navController: NavController,
    onQuickAdd: (() -> Unit)? = null,
    accountAction: (@Composable () -> Unit)? = null,
) {
    agendaScreen(
        onOpenEvent = { ref -> navController.navigate(AgendaRoutes.event(ref)) },
        onCreateEvent = { start -> navController.navigate(AgendaRoutes.newEvent(start)) },
        onQuickAdd = onQuickAdd,
        accountAction = accountAction,
    )
    eventDetailScreen(
        onBack = { navController.popBackStack() },
        onEdit = { ref -> navController.navigate(AgendaRoutes.editEvent(ref)) },
    )
    eventEditScreens(
        onDone = {
            if (!navController.popBackStack(AgendaRoutes.AGENDA, inclusive = false)) navController.popBackStack()
        },
        onClose = { navController.popBackStack() },
    )
    icsImportScreen(
        onDone = {
            if (!navController.popBackStack(AgendaRoutes.AGENDA, inclusive = false)) navController.popBackStack()
        },
        onClose = { navController.popBackStack() },
    )
}

private const val NO_START = -1L
