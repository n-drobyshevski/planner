package page.planr.android.feature.tasks.data

import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.model.DeletedTaskSnapshot
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.data.repository.TaskRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Task

/**
 * What the tasks screens read and write. A seam over the :core:data
 * repositories so the view models can be unit-tested with an in-memory fake.
 */
interface TasksDataSource {
    /** The signed-in member's id (null while signed out). */
    val currentMemberId: Flow<String?>

    fun observeTasks(): Flow<List<Task>>

    fun observeMembers(): Flow<List<Member>>

    fun observeCategories(): Flow<List<Category>>

    fun observeBoards(): Flow<List<Board>>

    /** Refetches tasks and the workspace bundle (members, categories, boards). */
    suspend fun refresh()

    /** The web checkbox: complete or reopen, moving the task between boards. */
    suspend fun setDone(task: Task, done: Boolean): Task

    /** Throws StaleWriteException when [expectedUpdatedAt] no longer matches. */
    suspend fun updateTask(id: String, patch: TaskPatch, expectedUpdatedAt: Instant?): Task

    /** Creates a task (a subtask, from the detail). */
    suspend fun createTask(draft: TaskDraft): Task

    /** Deletes a task with its subtasks and calendar blocks; the snapshot holds its own row. */
    suspend fun deleteTask(id: String): DeletedTaskSnapshot

    /** Undo of [deleteTask] for a task that had no subtasks or blocks. */
    suspend fun restoreTask(snapshot: DeletedTaskSnapshot)

    /** Whether calendar blocks are linked to any of [taskIds] (asks the server). */
    suspend fun hasCalendarBlocks(taskIds: Collection<String>): Boolean
}

/** The production [TasksDataSource]: Room-backed repositories plus the session. */
class RepositoryTasksDataSource @Inject constructor(
    private val session: SessionManager,
    private val tasks: TaskRepository,
    private val workspace: WorkspaceRepository,
) : TasksDataSource {

    override val currentMemberId: Flow<String?> =
        session.authState.map { (it as? AuthState.SignedIn)?.session?.memberId }.distinctUntilChanged()

    override fun observeTasks(): Flow<List<Task>> = tasks.observeTasks()

    override fun observeMembers(): Flow<List<Member>> = workspace.observeMembers()

    override fun observeCategories(): Flow<List<Category>> = workspace.observeCategories()

    override fun observeBoards(): Flow<List<Board>> = workspace.observeBoards()

    override suspend fun refresh() = coroutineScope {
        val bundle = async { workspace.refresh() }
        val rows = async { tasks.refresh() }
        bundle.await()
        rows.await()
    }

    override suspend fun setDone(task: Task, done: Boolean): Task = tasks.setDone(task, done)

    override suspend fun updateTask(id: String, patch: TaskPatch, expectedUpdatedAt: Instant?): Task =
        tasks.updateTask(id, patch, expectedUpdatedAt)

    override suspend fun createTask(draft: TaskDraft): Task = tasks.createTask(draft)

    override suspend fun deleteTask(id: String): DeletedTaskSnapshot = tasks.deleteTask(id)

    override suspend fun restoreTask(snapshot: DeletedTaskSnapshot) = tasks.restoreTask(snapshot)

    override suspend fun hasCalendarBlocks(taskIds: Collection<String>): Boolean = tasks.hasCalendarBlocks(taskIds)
}
