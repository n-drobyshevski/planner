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

/**
 * Maximum nesting depth, in edges from a root (depth 0), as `MAX_DEPTH` in
 * lib/tasks/tree.ts: four visible levels. The DB trigger `tasks_nesting_guard`
 * rejects anything deeper.
 */
internal const val MAX_DEPTH = 3

/**
 * How deep [task] sits: its ancestors' count, as `depthOf` in
 * lib/tasks/tree.ts. A missing parent ends the walk, and a cycle can't loop.
 */
internal fun depthOf(task: Task, byId: Map<String, Task>): Int {
    var depth = 0
    var current = task.parentId
    val seen = HashSet<String>()
    while (current != null && seen.add(current)) {
        val parent = byId[current] ?: break
        depth++
        current = parent.parentId
    }
    return depth
}

/**
 * Every task id in [rootId]'s subtree, excluding the root (what a delete
 * cascades to).
 */
internal fun descendantIds(rootId: String, byParent: Map<String?, List<Task>>): List<String> {
    val out = ArrayList<String>()
    val seen = HashSet<String>()
    fun walk(id: String) {
        for (child in byParent[id].orEmpty()) {
            if (!seen.add(child.id)) continue
            out += child.id
            walk(child.id)
        }
    }
    walk(rootId)
    return out
}

/**
 * Subtasks waiting on an earlier sibling, as `blockedIds` in
 * lib/tasks/blocking.ts, under every sequential parent in [tasks]: the first
 * not-done child (in [TaskOrder]) can be completed, every later not-done one
 * is blocked. Done subtasks are never blocked, so they can always be reopened.
 */
internal fun sequentiallyBlockedIds(tasks: List<Task>): Set<String> {
    val blocked = HashSet<String>()
    val byParent = groupByParent(tasks)
    for (parent in tasks) {
        if (!parent.sequential) continue
        var sawOpen = false
        for (child in byParent[parent.id].orEmpty().sortedWith(TaskOrder)) {
            if (child.completedAt != null) continue
            if (sawOpen) blocked += child.id else sawOpen = true
        }
    }
    return blocked
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
