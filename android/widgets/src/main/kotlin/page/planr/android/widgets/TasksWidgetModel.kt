package page.planr.android.widgets

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskCompletion

/** The Tasks widget's list. */
internal data class TaskList(
    val today: LocalDate,
    val rows: List<TaskRow>,
    /** Open tasks in scope, including any beyond [TasksWidgetModel.MAX_ROWS]. */
    val openCount: Int,
)

internal data class TaskRow(
    val id: String,
    val title: String,
    val due: DueLabel?,
    /**
     * Only the owner may write a task (RLS `tasks_update`), and only a task
     * with a done column to move to can be completed (see [TaskCompletion]);
     * others just open it.
     */
    val canComplete: Boolean,
    /** Ticked here, write still in flight. */
    val completing: Boolean,
)

/** A due date relative to the viewer's today. */
internal sealed interface DueLabel {
    data class Overdue(val date: LocalDate) : DueLabel

    data object Today : DueLabel

    data object Tomorrow : DueLabel

    data class On(val date: LocalDate) : DueLabel
}

/** Builds [TaskList]. Pure, so it is unit-tested directly. */
internal object TasksWidgetModel {
    /** Enough to fill a tall widget; RemoteViews payloads stay small. */
    const val MAX_ROWS = 30

    /**
     * Open top-level tasks the viewer is responsible for (the assignee, else
     * the owner) plus everything filed under a shared context, in the
     * backlog's order: soonest due first, dated before undated, then priority
     * high to low, then the manual order.
     *
     * @param completing ids ticked in this widget whose write is in flight.
     * @param boards the workspace's boards, to tell which tasks can be completed.
     */
    fun build(
        tasks: List<Task>,
        categories: List<Category>,
        viewerId: String,
        today: LocalDate,
        completing: Set<String> = emptySet(),
        boards: List<Board> = emptyList(),
    ): TaskList {
        val sharedCategoryIds = categories.filter { it.isShared }.mapTo(HashSet()) { it.id }
        val visibleIds = tasks.mapTo(HashSet()) { it.id }
        val open = tasks
            // Top-level rows; a subtask whose parent RLS hides stands on its own.
            .filter { it.parentId == null || it.parentId !in visibleIds }
            .filter { it.completedAt == null }
            .filter { task ->
                (task.assigneeId ?: task.ownerId) == viewerId ||
                    (task.categoryId != null && task.categoryId in sharedCategoryIds)
            }
            .sortedWith(Order)

        val rows = open.take(MAX_ROWS).map { task ->
            TaskRow(
                id = task.id,
                title = task.title,
                due = task.dueDate?.let { dueLabel(it, today) },
                canComplete = task.ownerId == viewerId && TaskCompletion.canToggle(task, boards),
                completing = task.id in completing,
            )
        }
        return TaskList(today = today, rows = rows, openCount = open.size)
    }

    fun dueLabel(due: LocalDate, today: LocalDate): DueLabel = when {
        due < today -> DueLabel.Overdue(due)
        due == today -> DueLabel.Today
        due == today.plus(1, DateTimeUnit.DAY) -> DueLabel.Tomorrow
        else -> DueLabel.On(due)
    }

    private val Order: Comparator<Task> =
        compareBy<Task, LocalDate?>(nullsLast()) { it.dueDate }
            .thenByDescending { it.priority ?: 0 }
            .thenBy { it.position }
            .thenBy { it.createdAt }
}
