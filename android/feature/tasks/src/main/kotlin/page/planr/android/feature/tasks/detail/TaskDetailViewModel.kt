package page.planr.android.feature.tasks.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
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
import page.planr.android.core.model.TaskPriority
import page.planr.android.feature.tasks.data.TasksDataSource
import page.planr.android.feature.tasks.model.SubtaskProgress
import page.planr.android.feature.tasks.model.TaskForm
import page.planr.android.feature.tasks.model.TaskOrder
import page.planr.android.feature.tasks.model.isEmpty
import page.planr.android.feature.tasks.model.isOverdue
import page.planr.android.feature.tasks.model.progressDeep
import page.planr.android.feature.tasks.model.today
import page.planr.android.feature.tasks.model.viewerZone

enum class TaskDetailNotice { Stale, Failed, TitleRequired }

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
    /** Direct subtasks, read-only on mobile. */
    val subtasks: List<Task> = emptyList(),
    /** Whole-subtree progress, as on the card. */
    val progress: SubtaskProgress? = null,
    val overdue: Boolean = false,
    val dirty: Boolean = false,
    val saving: Boolean = false,
    /** Set after a successful save; the screen navigates back. */
    val saved: Boolean = false,
    val notice: TaskDetailNotice? = null,
)

/** One task: its details, the editor form and the save (`updateTask` with the stale-write guard). */
@HiltViewModel(assistedFactory = TaskDetailViewModel.Factory::class)
class TaskDetailViewModel @AssistedInject constructor(
    @Assisted private val taskId: String,
    private val data: TasksDataSource,
    private val clock: Clock,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(taskId: String): TaskDetailViewModel
    }

    /** The user's edits; null = untouched, so the form follows the stored row. */
    private val edits = MutableStateFlow<TaskForm?>(null)
    private val ui = MutableStateFlow(UiFlags())

    private val workspace = combine(
        data.observeTasks(),
        data.observeMembers(),
        data.observeCategories(),
        data.observeBoards(),
        data.currentMemberId,
    ) { tasks, members, categories, boards, viewerId -> Snapshot(tasks, members, categories, boards, viewerId) }

    val state: StateFlow<TaskDetailUiState> =
        combine(workspace, edits, ui) { snapshot, edits, flags -> render(snapshot, edits, flags) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TaskDetailUiState())

    fun setTitle(value: String) = edit { it.copy(title = value) }

    fun setNotes(value: String) = edit { it.copy(notes = value) }

    fun setBoard(board: Board) = edit { it.withBoard(board) }

    fun setDueDate(date: LocalDate?) = edit { it.copy(dueDate = date) }

    fun setPriority(priority: TaskPriority) = edit { it.copy(priority = priority) }

    fun setAssignee(memberId: String?) = edit { it.copy(assigneeId = memberId) }

    fun setCategory(categoryId: String?) = edit { it.copy(categoryId = categoryId) }

    fun dismissNotice() = ui.update { it.copy(notice = null) }

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

    private fun render(snapshot: Snapshot, edits: TaskForm?, flags: UiFlags): TaskDetailUiState {
        val task = snapshot.tasks.firstOrNull { it.id == taskId }
            ?: return TaskDetailUiState(loading = false, notice = flags.notice)
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
            subtasks = byParent[task.id].orEmpty().sortedWith(TaskOrder),
            progress = progressDeep(task.id, byParent),
            overdue = !form.done && isOverdue(form.dueDate, clock.today(viewerZone(viewer))),
            dirty = form != stored,
            saving = flags.saving,
            saved = flags.saved,
            notice = flags.notice,
        )
    }

    private data class UiFlags(
        val saving: Boolean = false,
        val saved: Boolean = false,
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
