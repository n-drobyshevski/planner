package page.planr.android.feature.tasks.detail

import kotlin.time.Instant
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.model.Board
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskCompletion

/** How a delete goes, given what the DB would cascade to. */
sealed interface DeletePlan {
    /** Nothing else goes with it: delete now, offer Undo. */
    data object Immediate : DeletePlan

    /**
     * Subtasks or calendar blocks would go with it: say so and ask first.
     * There is no Undo, as only the task's own row could be put back.
     */
    data class Confirm(val subtasks: Int, val withBlocks: Boolean) : DeletePlan
}

/** [subtasks] is the whole subtree below the task; [hasBlocks] any calendar block linked to it. */
internal fun deletePlan(subtasks: Int, hasBlocks: Boolean): DeletePlan =
    if (subtasks == 0 && !hasBlocks) DeletePlan.Immediate else DeletePlan.Confirm(subtasks, hasBlocks)

/**
 * A new subtask of [parent], as the web's subtask editor files it: same
 * workspace, owner, collection, assignee, context and privacy, sorted last
 * (position = now). It starts in the parent's column, unless that is a done
 * column, where it would be born completed: then the collection's first
 * open one.
 */
internal fun subtaskDraft(parent: Task, title: String, boards: List<Board>, now: Instant): TaskDraft {
    val parentBoard = boards.firstOrNull { it.id == parent.boardId }
    val boardId = if (parentBoard?.isDone == true) {
        TaskCompletion.targetBoard(parent, boards, done = false)?.id ?: parent.boardId
    } else {
        parent.boardId
    }
    return TaskDraft(
        workspaceId = parent.workspaceId,
        ownerId = parent.ownerId,
        title = title.trim(),
        parentId = parent.id,
        collectionId = parent.collectionId,
        assigneeId = parent.assigneeId,
        categoryId = parent.categoryId,
        isPrivate = parent.isPrivate,
        boardId = boardId,
        position = now.toEpochMilliseconds().toDouble(),
    )
}
