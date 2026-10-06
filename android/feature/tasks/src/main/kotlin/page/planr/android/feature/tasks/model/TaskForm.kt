package page.planr.android.feature.tasks.model

import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import page.planr.android.core.data.attributes.AttributeKey
import page.planr.android.core.data.attributes.AttributesMerge
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.model.Board
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskPriority
import page.planr.android.core.recurrence.PatchField

/**
 * The editable fields of the task editor (a subset of the web's task dialog):
 * title, notes, status, due date, priority, assignee, context and the known
 * optimization attributes.
 *
 * Status is the board ("column") when the task's collection has boards, as on
 * the web. [done] follows the board: the `tasks_normalize_completed_at`
 * trigger derives `completed_at` from it, so a task without boards can't
 * change its completion here (see `TaskCompletion`).
 */
data class TaskForm(
    val title: String,
    val notes: String,
    val done: Boolean,
    val boardId: String?,
    val dueDate: LocalDate?,
    val priority: TaskPriority,
    val assigneeId: String?,
    val categoryId: String?,
    val attributes: Map<AttributeKey, String> = emptyMap(),
) {
    val isTitleValid: Boolean get() = title.isNotBlank()

    /** Picks a column; completion follows its `is_done`. */
    fun withBoard(board: Board): TaskForm = copy(boardId = board.id, done = board.isDone)

    /**
     * The patch that turns [base] into this form: only changed fields are
     * written (like the web's `Partial<TaskInput>`). `completed_at` changes
     * only together with a board move ([withBoard]); it is the client value
     * matching what the DB trigger derives from the new board.
     */
    fun toPatch(base: Task, now: Instant): TaskPatch {
        val original = from(base)
        val title = title.trim()
        val notes = notes.trim().ifEmpty { null }
        return TaskPatch(
            title = if (title != base.title) PatchField.Value(title) else PatchField.Unchanged,
            description = if (notes != base.description?.trim()?.ifEmpty { null }) {
                PatchField.Value(notes)
            } else {
                PatchField.Unchanged
            },
            boardId = if (boardId != original.boardId) PatchField.Value(boardId) else PatchField.Unchanged,
            completedAt = if (done != original.done && boardId != original.boardId) {
                PatchField.Value(if (done) base.completedAt ?: now else null)
            } else {
                PatchField.Unchanged
            },
            dueDate = if (dueDate != base.dueDate) PatchField.Value(dueDate) else PatchField.Unchanged,
            priority = if (priority != original.priority) PatchField.Value(priority.value) else PatchField.Unchanged,
            assigneeId = if (assigneeId != base.assigneeId) PatchField.Value(assigneeId) else PatchField.Unchanged,
            categoryId = if (categoryId != base.categoryId) PatchField.Value(categoryId) else PatchField.Unchanged,
            // Only the edited keys, merged into the stored bag: unknown keys survive.
            attributes = AttributesMerge.edits(original.attributes, attributes)
                .takeIf { it.isNotEmpty() }
                ?.let { PatchField.Value(AttributesMerge.merge(base.attributes, it)) }
                ?: PatchField.Unchanged,
        )
    }

    companion object {
        fun from(task: Task): TaskForm = TaskForm(
            title = task.title,
            notes = task.description.orEmpty(),
            done = task.completedAt != null,
            boardId = task.boardId,
            dueDate = task.dueDate,
            priority = task.priorityLevel,
            assigneeId = task.assigneeId,
            categoryId = task.categoryId,
            attributes = AttributesMerge.known(task.attributes),
        )
    }
}

/** Whether [patch] writes anything at all. */
internal val TaskPatch.isEmpty: Boolean get() = this == TaskPatch()
