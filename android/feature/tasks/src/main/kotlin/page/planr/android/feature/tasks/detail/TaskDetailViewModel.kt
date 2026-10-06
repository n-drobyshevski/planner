package page.planr.android.feature.tasks.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskCompletion
import page.planr.android.core.model.TaskPriority
import page.planr.android.feature.tasks.data.TasksDataSource
import page.planr.android.feature.tasks.model.SubtaskProgress
import page.planr.android.feature.tasks.model.TaskForm
import page.planr.android.feature.tasks.model.TaskOrder
import page.planr.android.feature.tasks.model.descendantIds
import page.planr.android.feature.tasks.model.isEmpty
import page.planr.android.feature.tasks.model.isOverdue
import page.planr.android.feature.tasks.model.progressDeep
import page.planr.android.feature.tasks.model.sequentiallyBlockedIds
import page.planr.android.feature.tasks.model.today
import page.planr.android.feature.tasks.model.viewerZone

enum class TaskDetailNotice { Stale, Failed, TitleRequired }

/** A direct subtask's row in the detail. */
data class SubtaskItem(
    val task: Task,
    /** Optimistic while a completion write is in flight. */
    val done: Boolean,
    /**
     * The checkbox works: the viewer owns the subtask, its collection has a
     * board to move it to ([TaskCompletion]) and it isn't [blocked].
     */
    val canToggle: Boolean,
    /** Under a sequential parent, waiting on an earlier sibling. */
    val blocked: Boolean,
    /** A completion write is in flight (the checkbox is disabled). */
    val pending: Boolean,
)

data class TaskDetailUiState(
    val loading: Boolean = true,
    /** Null once loaded means the task is gone (deleted, or hidden by RLS). */
    val task: Task? = null,
    /** The editable copy; equal to the stored task until the user changes something. */
    val form: TaskForm? = null,
    val canEdit: Boolean = false,
    val owner: Member? = null,
    val members: List<Member> = emptyList(),
    /** Contexts the task can be filed under: shared ones and the owner's own. */
    val categories: List<Category> = emptyList(),
    /** The task's collection columns, ordered; empty for a task outside any collection. */
    val boards: List<Board> = emptyList(),
    val parent: Task? = null,
    /** Direct subtasks, in order. */
    val subtasks: List<SubtaskItem> = emptyList(),
    /** The inline "Add a subtask" field (owner only). */
    val subtaskTitle: String = "",
    val addingSubtask: Boolean = false,
    /** Whole-subtree progress, as on the card. */
    val progress: SubtaskProgress? = null,
    val overdue: Boolean = false,
    val dirty: Boolean = false,
    val saving: Boolean = false,
    /** Set after a successful save; the screen navigates back. */
    val saved: Boolean = false,
    /** A delete (or its pre-check) is in flight. */
    val deleting: Boolean = false,
    /** The delete would cascade: the confirm dialog's facts. */
    val confirmDelete: DeletePlan.Confirm? = null,
    /** Set after a delete; the screen navigates back. */
    val deleted: Boolean = false,
    val notice: TaskDetailNotice? = null,
)

/**
 * One task: its details, the editor form and the save (`updateTask` with the
 * stale-write guard), its subtasks (complete / reopen, add) and delete.
 */
@HiltViewModel(assistedFactory = TaskDetailViewModel.Factory::class)
class TaskDetailViewModel @AssistedInject constructor(
    @Assisted private val taskId: String,
    private val data: TasksDataSource,
    private val clock: Clock,
    private val deletions: TaskDeletions,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(taskId: String): TaskDetailViewModel
    }

    /** The user's edits; null = untouched, so the form follows the stored row. */
    private val edits = MutableStateFlow<TaskForm?>(null)
    private val ui = MutableStateFlow(UiFlags())

    /** Optimistic subtask completion by id while a write is in flight. */
    private val pending = MutableStateFlow<Map<String, Boolean>>(emptyMap())

    private val workspace = combine(
        data.observeTasks(),
        data.observeMembers(),
        data.observeCategories(),
        data.observeBoards(),
        data.currentMemberId,
    ) { tasks, members, categories, boards, viewerId -> Snapshot(tasks, members, categories, boards, viewerId) }

    /** The latest rows, for actions that need more than the rendered state. */
    @Volatile
    private var latest: Snapshot? = null

    val state: StateFlow<TaskDetailUiState> =
        combine(workspace, edits, ui, pending) { snapshot, edits, flags, pending ->
            latest = snapshot
            render(snapshot, edits, flags, pending)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TaskDetailUiState())

    /** Tasks deleted from another detail (a subtask's), for this screen's "Deleted · Undo". */
    val deletedTasks: Flow<TaskDeleted> = deletions.claims(except = taskId)

    fun setTitle(value: String) = edit { it.copy(title = value) }

    fun setNotes(value: String) = edit { it.copy(notes = value) }

    fun setBoard(board: Board) = edit { it.withBoard(board) }

    fun setDueDate(date: LocalDate?) = edit { it.copy(dueDate = date) }

    fun setPriority(priority: TaskPriority) = edit { it.copy(priority = priority) }

    fun setAssignee(memberId: String?) = edit { it.copy(assigneeId = memberId) }

    fun setCategory(categoryId: String?) = edit { it.copy(categoryId = categoryId) }

    fun dismissNotice() = ui.update { it.copy(notice = null) }

    fun setSubtaskTitle(value: String) = ui.update { it.copy(subtaskTitle = value) }

    /**
     * A subtask's checkbox: the same completion as the list's (`setDone`, a
     * board move). Under a sequential parent only the next open subtask can
     * be completed.
     */
    fun toggleSubtask(id: String) {
        val item = state.value.subtasks.firstOrNull { it.task.id == id } ?: return
        if (!item.canToggle || item.pending) return
        val done = !item.done
        pending.update { it + (id to done) }
        viewModelScope.launch {
            try {
                data.setDone(item.task, done)
            } catch (e: CancellationException) {
                throw e
            } catch (_: StaleWriteException) {
                ui.update { it.copy(notice = TaskDetailNotice.Stale) }
            } catch (_: Exception) {
                ui.update { it.copy(notice = TaskDetailNotice.Failed) }
            } finally {
                pending.update { it - id }
            }
        }
    }

    /** The inline field's Done: creates a subtask filed like this task. */
    fun addSubtask() {
        val current = state.value
        val parent = current.task ?: return
        val sent = current.subtaskTitle
        if (!current.canEdit || current.addingSubtask || current.deleting || sent.isBlank()) return
        val draft = subtaskDraft(parent, sent, latest?.boards.orEmpty(), clock.now())
        ui.update { it.copy(addingSubtask = true) }
        viewModelScope.launch {
            try {
                data.createTask(draft)
                // Cleared for the next one, unless it was edited meanwhile.
                ui.update { it.copy(addingSubtask = false, subtaskTitle = if (it.subtaskTitle == sent) "" else it.subtaskTitle) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(addingSubtask = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    /**
     * Delete from the top bar. A task nothing else would go with is deleted
     * at once, and the screen it returns to offers Undo; one with subtasks
     * or calendar blocks asks first ([TaskDetailUiState.confirmDelete]).
     */
    fun delete() {
        val current = state.value
        val task = current.task ?: return
        // Not while a subtask is being added: the plan would miss it, and the
        // cascade would take it with no Undo.
        if (!current.canEdit || current.saving || current.deleting || current.addingSubtask) return
        val subtree = descendantIds(task.id, latest?.tasks.orEmpty().groupBy { it.parentId })
        ui.update { it.copy(deleting = true, notice = null) }
        viewModelScope.launch {
            try {
                val hasBlocks = data.hasCalendarBlocks(listOf(task.id) + subtree)
                when (val plan = deletePlan(subtree.size, hasBlocks)) {
                    DeletePlan.Immediate -> performDelete(task.id, undoable = true)
                    is DeletePlan.Confirm -> ui.update { it.copy(deleting = false, confirmDelete = plan) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(deleting = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    /** The confirm dialog's Delete: everything below goes too, with no Undo. */
    fun confirmDelete() {
        val current = state.value
        val task = current.task ?: return
        if (current.confirmDelete == null || current.deleting) return
        ui.update { it.copy(confirmDelete = null, deleting = true) }
        viewModelScope.launch {
            try {
                performDelete(task.id, undoable = false)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(deleting = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    fun dismissDelete() = ui.update { it.copy(confirmDelete = null) }

    /** Undo from this screen's snackbar (a subtask deleted from its own detail). */
    fun undoDelete(deleted: TaskDeleted) {
        viewModelScope.launch {
            try {
                deleted.undo()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(notice = TaskDetailNotice.Failed) }
            }
        }
    }

    private suspend fun performDelete(id: String, undoable: Boolean) {
        val snapshot = data.deleteTask(id)
        if (undoable) deletions.post(TaskDeleted(id) { data.restoreTask(snapshot) })
        ui.update { it.copy(deleting = false, deleted = true) }
    }

    /** Writes the changed fields, guarded by the row's `updated_at`. */
    fun save() {
        val current = state.value
        val task = current.task ?: return
        val form = current.form ?: return
        if (!current.canEdit || current.saving) return
        if (!form.isTitleValid) {
            ui.update { it.copy(notice = TaskDetailNotice.TitleRequired) }
            return
        }
        val patch = form.toPatch(task, clock.now())
        if (patch.isEmpty) {
            ui.update { it.copy(saved = true) }
            return
        }
        ui.update { it.copy(saving = true, notice = null) }
        viewModelScope.launch {
            try {
                data.updateTask(task.id, patch, expectedUpdatedAt = task.updatedAt)
                edits.value = null
                ui.update { it.copy(saving = false, saved = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: StaleWriteException) {
                // The repository has reloaded the latest row; the edits stay so
                // the user can review them against it and save again.
                ui.update { it.copy(saving = false, notice = TaskDetailNotice.Stale) }
            } catch (_: Exception) {
                ui.update { it.copy(saving = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    private fun edit(change: (TaskForm) -> TaskForm) {
        val current = state.value
        val base = current.form ?: return
        if (!current.canEdit || current.saving) return
        edits.value = change(edits.value ?: base)
    }

    private fun render(
        snapshot: Snapshot,
        edits: TaskForm?,
        flags: UiFlags,
        pending: Map<String, Boolean>,
    ): TaskDetailUiState {
        val task = snapshot.tasks.firstOrNull { it.id == taskId }
            // Just deleted here: blank while the screen closes, not "not found".
            ?: return if (flags.deleted) {
                TaskDetailUiState(loading = true, deleted = true)
            } else {
                TaskDetailUiState(loading = false, notice = flags.notice)
            }
        val viewer = snapshot.members.firstOrNull { it.id == snapshot.viewerId }
        val stored = TaskForm.from(task)
        val form = edits ?: stored
        val byParent = snapshot.tasks.groupBy { it.parentId }
        return TaskDetailUiState(
            loading = false,
            task = task,
            form = form,
            canEdit = snapshot.viewerId != null && task.ownerId == snapshot.viewerId,
            owner = snapshot.members.firstOrNull { it.id == task.ownerId },
            members = snapshot.members,
            categories = snapshot.categories.filter { it.isShared || it.ownerId == task.ownerId },
            boards = task.collectionId
                ?.let { collection -> snapshot.boards.filter { it.collectionId == collection } }
                .orEmpty()
                .sortedBy { it.position },
            parent = task.parentId?.let { id -> snapshot.tasks.firstOrNull { it.id == id } },
            subtasks = subtaskItems(byParent[task.id].orEmpty(), snapshot, pending),
            subtaskTitle = flags.subtaskTitle,
            addingSubtask = flags.addingSubtask,
            progress = progressDeep(task.id, byParent),
            overdue = !form.done && isOverdue(form.dueDate, clock.today(viewerZone(viewer))),
            dirty = form != stored,
            saving = flags.saving,
            saved = flags.saved,
            deleting = flags.deleting,
            confirmDelete = flags.confirmDelete,
            deleted = flags.deleted,
            notice = flags.notice,
        )
    }

    private fun subtaskItems(children: List<Task>, snapshot: Snapshot, pending: Map<String, Boolean>): List<SubtaskItem> {
        val blocked = sequentiallyBlockedIds(snapshot.tasks)
        return children.sortedWith(TaskOrder).map { child ->
            val isBlocked = child.id in blocked
            SubtaskItem(
                task = child,
                done = pending[child.id] ?: (child.completedAt != null),
                canToggle = snapshot.viewerId != null &&
                    child.ownerId == snapshot.viewerId &&
                    !isBlocked &&
                    TaskCompletion.canToggle(child, snapshot.boards),
                blocked = isBlocked,
                pending = child.id in pending,
            )
        }
    }

    private data class UiFlags(
        val saving: Boolean = false,
        val saved: Boolean = false,
        val subtaskTitle: String = "",
        val addingSubtask: Boolean = false,
        val deleting: Boolean = false,
        val confirmDelete: DeletePlan.Confirm? = null,
        val deleted: Boolean = false,
        val notice: TaskDetailNotice? = null,
    )

    private data class Snapshot(
        val tasks: List<Task>,
        val members: List<Member>,
        val categories: List<Category>,
        val boards: List<Board>,
        val viewerId: String?,
    )

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
