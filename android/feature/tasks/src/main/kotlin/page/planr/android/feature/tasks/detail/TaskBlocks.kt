package page.planr.android.feature.tasks.detail

import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.model.DeletedEventSnapshot
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.Task

/** One of the task's calendar blocks, as the detail lists it. */
data class TaskBlockItem(
    val event: PlannerEvent,
    /** Ended before now; listed after the upcoming ones. */
    val past: Boolean,
    /** The viewer owns the block, so may take it off the calendar. */
    val canRemove: Boolean,
    /** Its removal (or an Undo touching it) is in flight. */
    val pending: Boolean,
)

/** The "Add to calendar" sheet: a day, a start and a duration. */
data class BlockSheetState(
    val date: LocalDate,
    val start: LocalTime,
    val minutes: Int,
    /** The user set the start; changing the day or duration no longer moves it. */
    val startPicked: Boolean = false,
    /** The block is being created. */
    val saving: Boolean = false,
)

/** A block write's result for the snackbar, with the Undo that reverses it (the web's toast). */
sealed interface BlockNotice {
    /** "Added to calendar · Undo" deletes the new block. */
    data class Added(val eventId: String) : BlockNotice

    /** "Removed from calendar · Undo" puts the block back. */
    data class Removed(val eventId: String, val snapshot: DeletedEventSnapshot) : BlockNotice
}

/**
 * The block for [task] at [start], as the web's `scheduleTaskBlocks` writes
 * it: linked by task_id, titled and filed like the task, with its notes,
 * privacy and optimization attributes, owned by [ownerId] and stored in the
 * viewer's [zone].
 */
internal fun blockDraft(task: Task, ownerId: String, start: Instant, minutes: Int, zone: TimeZone): PlannerEventDraft =
    PlannerEventDraft(
        workspaceId = task.workspaceId,
        ownerId = ownerId,
        categoryId = task.categoryId,
        title = task.title,
        description = task.description,
        isPrivate = task.isPrivate,
        allDay = false,
        start = start,
        end = start + minutes.minutes,
        timeZone = zone.id,
        taskId = task.id,
        attributes = task.attributes,
    )

/** Upcoming blocks first (soonest first), then past ones (latest first). */
internal fun blockItems(
    blocks: List<PlannerEvent>,
    now: Instant,
    viewerId: String?,
    pending: Set<String>,
): List<TaskBlockItem> {
    val (past, upcoming) = blocks.partition { it.end <= now }
    return (upcoming.sortedBy { it.start } + past.sortedByDescending { it.start }).map { event ->
        TaskBlockItem(
            event = event,
            past = event.end <= now,
            canRemove = viewerId != null && event.ownerId == viewerId,
            pending = event.id in pending,
        )
    }
}
