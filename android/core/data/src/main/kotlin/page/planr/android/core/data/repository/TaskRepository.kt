package page.planr.android.core.data.repository

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.local.CacheArea
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.local.PlanrDatabase
import page.planr.android.core.data.local.RefreshCoalescer
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.model.DeletedTaskSnapshot
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.data.remote.TaskMutations
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskCompletion
import page.planr.android.core.model.TaskNotToggleableException
import page.planr.android.core.recurrence.PatchField

/**
 * Tasks: Room-backed reads and the v1 writes (create / update / complete /
 * delete). Writes go to Supabase first; Room follows through [CacheGate]
 * (see [EventRepository]).
 */
@Singleton
class TaskRepository @Inject constructor(
    private val session: SessionManager,
    private val queries: WorkspaceQueries,
    private val mutations: TaskMutations,
    private val db: PlanrDatabase,
    private val gate: CacheGate,
    private val widgets: WidgetRefreshDispatcher,
    private val clock: Clock,
    private val coalescer: RefreshCoalescer = RefreshCoalescer(gate, clock),
) {
    private val dao get() = db.taskDao()

    /** Every visible task (top-level and subtasks), ordered by position. Decoded off the main thread. */
    fun observeTasks(): Flow<List<Task>> =
        session.inWorkspace(emptyList()) { ws -> dao.observeAll(ws).map { rows -> rows.map { it.toModel() } } }
            .flowOn(Dispatchers.Default)

    fun observeTask(id: String): Flow<Task?> = dao.observeById(id).map { it?.toModel() }

    suspend fun getTask(id: String): Task? = dao.getById(id)?.toModel()

    /**
     * Refetches all tasks (`fetchTasks`) and replaces the cached set. Joins a
     * refresh already running and skips one done moments ago unless [force]d
     * ([RefreshCoalescer]). Returns whether the cache changed (an identical
     * snapshot is not written).
     */
    suspend fun refresh(force: Boolean = false): Boolean {
        val ws = session.requireSession().workspaceId
        return coalescer.refresh(ws, force) {
            var changed = false
            gate.refresh(CacheArea.Tasks, fetch = { queries.fetchTasks(ws) }) { rows ->
                changed = dao.replaceIfChanged(ws, rows.map { it.toEntity() })
            }
            changed
        }
    }

    /** Creates a task. Throws IllegalArgumentException for an invalid draft (e.g. blank title). */
    suspend fun createTask(draft: TaskDraft): Task = write({ mutations.createTask(draft) }) { storeLocally(it) }

    /**
     * Updates a task; with [expectedUpdatedAt] a concurrent edit elsewhere
     * throws [StaleWriteException] after the latest row is reloaded into Room.
     */
    suspend fun updateTask(id: String, patch: TaskPatch, expectedUpdatedAt: Instant? = null): Task {
        return write({
            try {
                mutations.updateTask(id, patch, expectedUpdatedAt)
            } catch (e: StaleWriteException) {
                runCatching { reloadTask(id) }
                throw e
            }
        }) { storeLocally(it) }
    }

    /**
     * Completes or reopens [task], as the web's checkbox and MCP `complete_task`
     * do: move it to its collection's first done board (or first open board
     * when reopening) and set / clear `completed_at` to match.
     *
     * Throws [TaskNotToggleableException] when there is no such board (see
     * [TaskCompletion]: the DB trigger would undo a bare `completed_at`), or
     * when the saved row still doesn't have the requested state.
     */
    suspend fun setDone(task: Task, done: Boolean): Task {
        val boards = task.collectionId?.let { db.workspaceDao().boardsOf(it).map { b -> b.toModel() } }.orEmpty()
        val target = TaskCompletion.targetBoard(task, boards, done) ?: throw TaskNotToggleableException(task.id)
        val patch = TaskPatch(
            completedAt = PatchField.Value(if (done) task.completedAt ?: clock.now() else null),
            boardId = if (target.id != task.boardId) PatchField.Value(target.id) else PatchField.Unchanged,
        )
        val saved = updateTask(task.id, patch)
        if ((saved.completedAt != null) != done) throw TaskNotToggleableException(task.id)
        return saved
    }

    /**
     * Deletes a task; the DB cascades subtasks and linked calendar blocks,
     * mirrored locally. Keep the snapshot to [restoreTask] (undo) a task
     * that had neither: it holds the task's own row only.
     */
    suspend fun deleteTask(id: String): DeletedTaskSnapshot =
        write({ mutations.deleteTask(id) }, CacheArea.Tasks, CacheArea.Events) {
            db.withTransaction {
                val ids = dao.subtreeIds(id)
                db.eventDao().deleteEventsOfTasks(ids)
                dao.delete(ids)
            }
        }

    /** Undo of [deleteTask]: re-inserts the captured rows as they were (same ids). */
    suspend fun restoreTask(snapshot: DeletedTaskSnapshot) {
        write({ mutations.restoreDeleted(snapshot) }) { restored -> dao.upsert(restored.map { it.toEntity() }) }
    }

    /**
     * Whether calendar blocks are linked to any of [taskIds] (deleting those
     * tasks would take the blocks with them). Asks the server.
     */
    suspend fun hasCalendarBlocks(taskIds: Collection<String>): Boolean =
        queries.hasEventsOfTasks(session.requireSession().workspaceId, taskIds)

    /**
     * Runs the Supabase write [remote], then mirrors its result into Room with
     * [local] unless the cache was wiped (sign-out) meanwhile, and asks the
     * widgets to refresh.
     */
    private suspend fun <T> write(
        remote: suspend () -> T,
        vararg areas: CacheArea = arrayOf(CacheArea.Tasks),
        local: suspend (T) -> Unit,
    ): T {
        val ticket = gate.ticket()
        val result = remote()
        gate.change(ticket, *areas) { local(result) }
        widgets.requestRefresh()
        return result
    }

    private suspend fun storeLocally(task: Task) {
        dao.upsert(listOf(task.toEntity()))
    }

    private suspend fun reloadTask(id: String) {
        val ws = session.requireSession().workspaceId
        write({ queries.fetchTask(ws, id) }) { latest ->
            if (latest == null) dao.delete(listOf(id)) else storeLocally(latest)
        }
    }
}
