package page.planr.android.feature.tasks.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskCompletion
import page.planr.android.feature.tasks.data.TasksCompute
import page.planr.android.feature.tasks.data.TasksDataSource
import page.planr.android.feature.tasks.detail.TaskDeleted
import page.planr.android.feature.tasks.detail.TaskDeletions
import page.planr.android.feature.tasks.model.TaskFilters
import page.planr.android.feature.tasks.model.TaskGroup
import page.planr.android.feature.tasks.model.TaskListBuilder
import page.planr.android.feature.tasks.model.TaskScope
import page.planr.android.feature.tasks.model.TaskStateFilter
import page.planr.android.feature.tasks.model.today
import page.planr.android.feature.tasks.model.viewerZone

/** A one-off message for the list's snackbar. */
sealed interface TasksNotice {
    /** Completed or reopened; [undo] flips it back. */
    data class Toggled(val taskId: String, val done: Boolean) : TasksNotice

    /** Someone changed the task elsewhere first; the latest row is now shown. */
    data object Stale : TasksNotice

    /** The write or refresh failed (usually offline: v1 writes need a connection). */
    data object Failed : TasksNotice
}

data class TasksUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val filters: TaskFilters = TaskFilters(),
    /** The other member's name, for the "Partner" filter chip. */
    val partnerName: String? = null,
    val groups: List<TaskGroup> = emptyList(),
    /** Whether the workspace has any task at all (empty state vs. "no matches"). */
    val hasAnyTask: Boolean = false,
    /** Tasks with a completion write in flight (their checkbox is disabled). */
    val pendingIds: Set<String> = emptySet(),
    val notice: TasksNotice? = null,
)

/**
 * The tasks list: Room-backed rows, filters, and the checkbox (`setDone`).
 * The list is built on [listDispatcher], never on the main thread.
 */
@HiltViewModel
class TasksViewModel @Inject constructor(
    private val data: TasksDataSource,
    private val clock: Clock,
    @TasksCompute private val listDispatcher: CoroutineDispatcher,
    deletions: TaskDeletions,
) : ViewModel() {

    private val filters = MutableStateFlow(TaskFilters())
    /** Optimistic completion by task id while a write is in flight. */
    private val pending = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    private val refreshing = MutableStateFlow(false)
    private val notice = MutableStateFlow<TasksNotice?>(null)

    private val workspace = combine(
        data.observeTasks(),
        data.observeMembers(),
        data.observeCategories(),
        data.observeBoards(),
        data.currentMemberId,
    ) { tasks, members, categories, boards, viewerId -> Snapshot(tasks, members, categories, boards, viewerId) }

    /** The latest rows, for actions that need the full [Task]. Written on [listDispatcher]. */
    @Volatile
    private var latest: Snapshot? = null

    val state: StateFlow<TasksUiState> =
        combine(workspace, filters, pending, refreshing, notice) { snapshot, filters, pending, refreshing, notice ->
            latest = snapshot
            val viewer = snapshot.members.firstOrNull { it.id == snapshot.viewerId }
            TasksUiState(
                loading = false,
                refreshing = refreshing,
                filters = filters,
                partnerName = snapshot.members.firstOrNull { it.id != snapshot.viewerId }?.name,
                groups = TaskListBuilder.build(
                    tasks = snapshot.tasks,
                    members = snapshot.members,
                    categories = snapshot.categories,
                    viewerId = snapshot.viewerId,
                    filters = filters,
                    today = clock.today(viewerZone(viewer)),
                    doneOverrides = pending,
                    boards = snapshot.boards,
                ),
                hasAnyTask = snapshot.tasks.isNotEmpty(),
                pendingIds = pending.keys,
                notice = notice,
            )
        }.flowOn(listDispatcher)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TasksUiState())

    /** Tasks deleted from their detail, for this screen's "Deleted · Undo". */
    val deletedTasks: Flow<TaskDeleted> = deletions.claims()

    init {
        // Room already has the last sync; this just tops it up quietly.
        viewModelScope.launch { runRefresh(reportFailure = false) }
    }

    fun setScope(scope: TaskScope) = filters.update { it.copy(scope = scope) }

    fun setStateFilter(state: TaskStateFilter) = filters.update { it.copy(state = state) }

    fun clearFilters() = filters.update { TaskFilters() }

    /** Pull to refresh. */
    fun refresh() {
        if (refreshing.value) return
        viewModelScope.launch { runRefresh(reportFailure = true) }
    }

    /**
     * The checkbox: complete an open task, reopen a done one. Owner only, and
     * only when the task's collection has a board to move it to.
     */
    fun toggleDone(taskId: String) {
        val snapshot = latest ?: return
        val task = snapshot.tasks.firstOrNull { it.id == taskId } ?: return
        if (task.ownerId != snapshot.viewerId || taskId in pending.value) return
        if (!TaskCompletion.canToggle(task, snapshot.boards)) return
        setDone(task, done = task.completedAt == null)
    }

    /** Undo from the snackbar: put the task back the way it was. */
    fun undo(toggled: TasksNotice.Toggled) {
        val task = latest?.tasks?.firstOrNull { it.id == toggled.taskId } ?: return
        notice.value = null
        if (task.id in pending.value) return
        setDone(task, done = !toggled.done)
    }

    /** Undo of a delete made in the detail: puts the task back as it was. */
    fun undoDelete(deleted: TaskDeleted) {
        viewModelScope.launch {
            try {
                deleted.undo()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                notice.value = TasksNotice.Failed
            }
        }
    }

    fun dismissNotice() {
        notice.value = null
    }

    /** Clears [shown] once the screen has consumed it; a newer notice is kept. */
    fun dismissNotice(shown: TasksNotice) {
        notice.compareAndSet(shown, null)
    }

    private fun setDone(task: Task, done: Boolean) {
        pending.update { it + (task.id to done) }
        viewModelScope.launch {
            notice.value = try {
                data.setDone(task, done)
                TasksNotice.Toggled(task.id, done)
            } catch (e: CancellationException) {
                throw e
            } catch (_: StaleWriteException) {
                TasksNotice.Stale
            } catch (_: Exception) {
                TasksNotice.Failed
            } finally {
                pending.update { it - task.id }
            }
        }
    }

    /** A user refresh shows the indicator and reports failure; the opening one is silent. */
    private suspend fun runRefresh(reportFailure: Boolean) {
        if (reportFailure) refreshing.value = true
        try {
            data.refresh(force = reportFailure)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            if (reportFailure) notice.value = TasksNotice.Failed
        } finally {
            if (reportFailure) refreshing.value = false
        }
    }

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
