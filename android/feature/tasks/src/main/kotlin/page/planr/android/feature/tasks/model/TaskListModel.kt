package page.planr.android.feature.tasks.model

import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskCompletion

/**
 * Whose tasks the list shows. "Mine" / "Partner" go by the responsible member
 * (the assignee, else the owner); "Shared" is a task filed under a shared
 * context, the same rule that makes an event joint.
 */
enum class TaskScope { All, Mine, Partner, Shared }

/** The completion filter (the web's Flows "State": All / Open / Done). */
enum class TaskStateFilter { Open, Done, All }

/**
 * List sections. Open tasks are bucketed by due date like the calendar's
 * backlog rail (Overdue / This week / Later / No date); completed ones follow
 * in a single Done section.
 */
enum class TaskGroupKey { Overdue, ThisWeek, Later, NoDate, Done }

data class TaskFilters(
    val scope: TaskScope = TaskScope.All,
    val state: TaskStateFilter = TaskStateFilter.Open,
)

/** One row of the list, with everything the card renders resolved. */
data class TaskListItem(
    val task: Task,
    /** Display color hex (task, else category, else member); null = neutral. */
    val colorHex: String?,
    val assignee: Member?,
    val done: Boolean,
    val overdue: Boolean,
    val progress: SubtaskProgress?,
    /** Only the owner may write a task (RLS `tasks_update`). */
    val canEdit: Boolean,
    /**
     * The checkbox works: the viewer owns the task and its collection has a
     * board to move it to (see [TaskCompletion]; the web's checkbox is a
     * no-op otherwise).
     */
    val canToggleDone: Boolean = canEdit,
)

data class TaskGroup(val key: TaskGroupKey, val items: List<TaskListItem>)

/** Builds the grouped, filtered list. Pure, so the view model tests can drive it directly. */
object TaskListBuilder {
    /** "This week" reaches through today + 7 days, like the backlog's `weekToken`. */
    private val WEEK = DatePeriod(days = 7)

    /**
     * @param tasks every visible task (subtasks included; they feed progress).
     * @param viewerId the signed-in member.
     * @param today the viewer's local date; due dates are zone-free.
     * @param doneOverrides optimistic completion for writes still in flight.
     * @param boards every board of the workspace, for [TaskListItem.canToggleDone].
     */
    fun build(
        tasks: List<Task>,
        members: List<Member>,
        categories: List<Category>,
        viewerId: String?,
        filters: TaskFilters,
        today: LocalDate,
        doneOverrides: Map<String, Boolean> = emptyMap(),
        boards: List<Board> = emptyList(),
    ): List<TaskGroup> {
        val memberById = members.associateBy { it.id }
        val categoryById = categories.associateBy { it.id }
        val sharedCategoryIds = categories.filter { it.isShared }.map { it.id }.toSet()
        val partnerId = members.firstOrNull { it.id != viewerId }?.id
        val byParent = groupByParent(tasks)
        val visibleIds = tasks.mapTo(HashSet()) { it.id }

        // Top-level rows; a subtask whose parent RLS hides stands on its own.
        val roots = tasks.filter { it.parentId == null || it.parentId !in visibleIds }

        val items = roots
            .filter { matchesScope(it, filters.scope, viewerId, partnerId, sharedCategoryIds) }
            .map { task ->
                val done = doneOverrides[task.id] ?: (task.completedAt != null)
                val canEdit = viewerId != null && task.ownerId == viewerId
                TaskListItem(
                    task = task,
                    colorHex = resolveTaskColor(task, categoryById, memberById),
                    assignee = task.assigneeId?.let(memberById::get),
                    done = done,
                    overdue = !done && isOverdue(task.dueDate, today),
                    progress = progressDeep(task.id, byParent),
                    canEdit = canEdit,
                    canToggleDone = canEdit && TaskCompletion.canToggle(task, boards),
                )
            }

        // Grouping uses the stored state so a row doesn't jump sections mid-write.
        val (doneItems, openItems) = items.partition { it.task.completedAt != null }
        val groups = mutableListOf<TaskGroup>()
        if (filters.state != TaskStateFilter.Done) {
            val weekEnd = today.plus(WEEK)
            val buckets = openItems.groupBy { dueGroup(it.task, today, weekEnd) }
            for (key in OPEN_ORDER) {
                val bucket = buckets[key].orEmpty()
                if (bucket.isNotEmpty()) groups += TaskGroup(key, bucket.sortedWith(OpenComparator))
            }
        }
        if (filters.state != TaskStateFilter.Open && doneItems.isNotEmpty()) {
            groups += TaskGroup(TaskGroupKey.Done, doneItems.sortedWith(DoneComparator))
        }
        return groups
    }

    private val OPEN_ORDER = listOf(TaskGroupKey.Overdue, TaskGroupKey.ThisWeek, TaskGroupKey.Later, TaskGroupKey.NoDate)

    internal fun dueGroup(task: Task, today: LocalDate, weekEnd: LocalDate): TaskGroupKey {
        val due = task.dueDate ?: return TaskGroupKey.NoDate
        return when {
            due < today -> TaskGroupKey.Overdue
            due <= weekEnd -> TaskGroupKey.ThisWeek
            else -> TaskGroupKey.Later
        }
    }

    private fun matchesScope(
        task: Task,
        scope: TaskScope,
        viewerId: String?,
        partnerId: String?,
        sharedCategoryIds: Set<String>,
    ): Boolean {
        val responsible = task.assigneeId ?: task.ownerId
        return when (scope) {
            TaskScope.All -> true
            TaskScope.Mine -> responsible == viewerId
            TaskScope.Partner -> partnerId != null && responsible == partnerId
            TaskScope.Shared -> task.categoryId != null && task.categoryId in sharedCategoryIds
        }
    }

    /**
     * The backlog's order: soonest due first, dated before undated, then
     * priority high to low, then the manual order (position, creation).
     */
    private val OpenComparator: Comparator<TaskListItem> =
        compareBy<TaskListItem, LocalDate?>(nullsLast()) { it.task.dueDate }
            .thenByDescending { it.task.priority ?: 0 }
            .thenBy { it.task.position }
            .thenBy { it.task.createdAt }

    /** Most recently completed first. */
    private val DoneComparator: Comparator<TaskListItem> =
        compareByDescending<TaskListItem> { it.task.completedAt }.thenBy { it.task.position }
}
