package page.planr.android.feature.tasks.model

import kotlinx.datetime.LocalDate
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Task

/** Done / total over a task's subtasks (the "2/5" on a card). */
data class SubtaskProgress(val done: Int, val total: Int)

/** Children by parent id; top-level tasks sit under `null` (lib/tasks/tree.ts `groupByParent`). */
internal fun groupByParent(tasks: List<Task>): Map<String?, List<Task>> = tasks.groupBy { it.parentId }

/**
 * Completion over a whole subtree (all descendants, excluding the root), as
 * `progressDeep` in lib/tasks/tree.ts. Null when there are no subtasks.
 */
internal fun progressDeep(rootId: String, byParent: Map<String?, List<Task>>): SubtaskProgress? {
    var done = 0
    var total = 0
    val seen = HashSet<String>()
    fun walk(id: String) {
        for (child in byParent[id].orEmpty()) {
            if (!seen.add(child.id)) continue
            total++
            if (child.completedAt != null) done++
            walk(child.id)
        }
    }
    walk(rootId)
    return if (total == 0) null else SubtaskProgress(done, total)
}

/** A due date before the viewer's today (`isDateTokenPast`); the caller excludes done tasks. */
internal fun isOverdue(dueDate: LocalDate?, today: LocalDate): Boolean = dueDate != null && dueDate < today

/** Order within a column / among siblings: position, then creation. */
internal val TaskOrder: Comparator<Task> = compareBy<Task> { it.position }.thenBy { it.createdAt }

/**
 * The task's display color (hex), as `resolveTaskColor` in lib/tasks/colors.ts:
 * its own color, else its category's, else the assignee's (or owner's) member
 * color. Null means "use the neutral fallback".
 */
internal fun resolveTaskColor(
    task: Task,
    categories: Map<String, Category>,
    members: Map<String, Member>,
): String? {
    task.color?.let { return it }
    task.categoryId?.let { id -> categories[id]?.let { return it.color } }
    return members[task.assigneeId ?: task.ownerId]?.color
}
