package page.planr.android.core.model

/**
 * The done checkbox, as the web's `toggleDone` (lib/hooks/use-task-mutations.ts)
 * and MCP `complete_task` do it: completing moves the task to its
 * collection's first done-board, reopening to its first open board.
 *
 * Completion lives in the board: the `tasks_normalize_completed_at` trigger
 * clears `completed_at` on any task that isn't on a done-board (and sets it on
 * one that is). So a task with no such board — outside any collection, or in
 * one without a done column — can't be toggled at all; writing just
 * `completed_at` would be silently undone by the database.
 */
object TaskCompletion {
    /** The board [task] moves to when set to [done]; null when there is none. */
    fun targetBoard(task: Task, boards: List<Board>, done: Boolean): Board? {
        val columns = boards.filter { it.collectionId == task.collectionId }.sortedBy { it.position }
        return if (done) columns.firstOrNull { it.isDone } else columns.firstOrNull { !it.isDone }
    }

    /** Whether the checkbox can flip [task] (complete an open one, reopen a done one). */
    fun canToggle(task: Task, boards: List<Board>): Boolean =
        targetBoard(task, boards, done = task.completedAt == null) != null
}

/** Thrown when a task can't be completed or reopened: see [TaskCompletion]. */
class TaskNotToggleableException(taskId: String) :
    IllegalStateException("Task $taskId has no board to move to; its completion can't change.")
