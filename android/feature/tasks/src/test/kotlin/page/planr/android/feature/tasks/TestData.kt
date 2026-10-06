package page.planr.android.feature.tasks

import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import page.planr.android.core.data.model.DeletedTaskSnapshot
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task
import page.planr.android.core.recurrence.PatchField
import page.planr.android.feature.tasks.data.TasksDataSource

const val WS = "ws-1"
const val ANNA = "member-a"
const val BORIS = "member-b"

/** 2026-10-04 10:00 UTC; members below are on UTC, so "today" is Oct 4. */
val NOW: Instant = Instant.parse("2026-10-04T10:00:00Z")
val TODAY: LocalDate = LocalDate(2026, 10, 4)

object FixedClock : Clock {
    override fun now(): Instant = NOW
}

val anna = Member(id = ANNA, workspaceId = WS, name = "Anna", color = "#c0492a", timezone = "UTC")
val boris = Member(id = BORIS, workspaceId = WS, name = "Boris", color = "#0f766e", timezone = "UTC")

val sharedHome = Category(id = "cat-home", workspaceId = WS, ownerId = null, name = "Home", color = "#b45309")
val annaWork = Category(id = "cat-work", workspaceId = WS, ownerId = ANNA, name = "Work", color = "#2a77b8")

fun task(
    id: String,
    owner: String = ANNA,
    assignee: String? = null,
    parent: String? = null,
    due: LocalDate? = null,
    done: Boolean = false,
    priority: Int? = null,
    category: String? = null,
    collection: String? = null,
    board: String? = null,
    position: Double = 0.0,
    title: String = "Task $id",
    completedAt: Instant? = if (done) NOW else null,
): Task = Task(
    id = id,
    workspaceId = WS,
    ownerId = owner,
    assigneeId = assignee,
    parentId = parent,
    collectionId = collection,
    categoryId = category,
    title = title,
    boardId = board,
    priority = priority,
    dueDate = due,
    position = position,
    completedAt = completedAt,
    createdAt = Instant.parse("2026-09-01T00:00:00Z"),
    updatedAt = Instant.parse("2026-09-02T00:00:00Z"),
)

/** A calendar occurrence, Anna's and timed unless told otherwise. */
fun occurrence(
    id: String,
    start: Instant,
    end: Instant,
    owner: String = ANNA,
    shared: Boolean = false,
    allDay: Boolean = false,
    status: EventStatus = EventStatus.Confirmed,
    kind: EventKind = EventKind.Event,
): Occurrence = Occurrence(
    key = id,
    eventId = id,
    occurrenceDate = start,
    start = start,
    end = end,
    allDay = allDay,
    inactive = false,
    status = status,
    title = id,
    description = null,
    location = null,
    categoryId = null,
    color = null,
    kind = kind,
    ownerId = owner,
    isPrivate = false,
    isShared = shared,
    hiddenFromPublic = false,
    taskId = null,
    attributes = JsonObject(emptyMap()),
    isRecurring = false,
    isException = false,
)

/** A collection with an open and a done column, so its tasks can be checked off. */
const val COL = "col"

fun board(id: String, collection: String, position: Double, done: Boolean = false) = Board(
    id = id,
    workspaceId = WS,
    collectionId = collection,
    name = id,
    position = position,
    isDone = done,
    createdAt = NOW,
    updatedAt = NOW,
)

val columns = listOf(board("todo", COL, 0.0), board("done", COL, 1.0, done = true))

/** An in-memory [TasksDataSource] that records writes and can be told to fail. */
class FakeTasksDataSource(
    tasks: List<Task> = emptyList(),
    members: List<Member> = listOf(anna, boris),
    categories: List<Category> = listOf(sharedHome, annaWork),
    boards: List<Board> = columns,
    viewer: String? = ANNA,
) : TasksDataSource {
    val tasks = MutableStateFlow(tasks)
    private val members = MutableStateFlow(members)
    private val categories = MutableStateFlow(categories)
    private val boards = MutableStateFlow(boards)
    private val viewer = MutableStateFlow(viewer)

    val setDoneCalls = mutableListOf<Pair<String, Boolean>>()
    val updates = mutableListOf<Triple<String, TaskPatch, Instant?>>()
    var refreshCount = 0
    var failWith: Exception? = null
    /** When set, setDone suspends until it completes (a write in flight). */
    var setDoneGate: CompletableDeferred<Unit>? = null
    /** When set, updateTask suspends until it completes (a save in flight). */
    var updateGate: CompletableDeferred<Unit>? = null
    /** When set, createTask suspends until it completes (an add in flight). */
    var createGate: CompletableDeferred<Unit>? = null
    /** When set, deleteTask suspends until it completes (a delete in flight). */
    var deleteGate: CompletableDeferred<Unit>? = null

    val created = mutableListOf<TaskDraft>()
    val deletedIds = mutableListOf<String>()
    val restoredIds = mutableListOf<String>()
    /** Tasks with a calendar block linked to them. */
    var blockedTaskIds: Set<String> = emptySet()
    val blockChecks = mutableListOf<Collection<String>>()
    private val deletedRows = mutableMapOf<String, Task>()

    override val currentMemberId: Flow<String?> = this.viewer

    override fun observeTasks(): Flow<List<Task>> = tasks

    override fun observeMembers(): Flow<List<Member>> = members

    override fun observeCategories(): Flow<List<Category>> = categories

    override fun observeBoards(): Flow<List<Board>> = boards.map { it }

    override suspend fun refresh() {
        refreshCount++
        failWith?.let { throw it }
    }

    override suspend fun setDone(task: Task, done: Boolean): Task {
        setDoneCalls += task.id to done
        setDoneGate?.await()
        failWith?.let { throw it }
        val updated = task.copy(completedAt = if (done) NOW else null)
        replace(updated)
        return updated
    }

    override suspend fun updateTask(id: String, patch: TaskPatch, expectedUpdatedAt: Instant?): Task {
        updates += Triple(id, patch, expectedUpdatedAt)
        updateGate?.await()
        failWith?.let { throw it }
        val current = tasks.value.first { it.id == id }
        if (expectedUpdatedAt != null && expectedUpdatedAt != current.updatedAt) throw StaleWriteException("tasks", id)
        val updated = current.copy(
            title = patch.title.valueOr(current.title),
            description = patch.description.valueOr(current.description),
            dueDate = patch.dueDate.valueOr(current.dueDate),
            priority = patch.priority.valueOr(current.priority),
            assigneeId = patch.assigneeId.valueOr(current.assigneeId),
            categoryId = patch.categoryId.valueOr(current.categoryId),
            boardId = patch.boardId.valueOr(current.boardId),
            completedAt = patch.completedAt.valueOr(current.completedAt),
            updatedAt = NOW,
        )
        replace(updated)
        return updated
    }

    override suspend fun createTask(draft: TaskDraft): Task {
        created += draft
        createGate?.await()
        failWith?.let { throw it }
        val task = Task(
            id = "new-${created.size}",
            workspaceId = draft.workspaceId,
            ownerId = draft.ownerId,
            assigneeId = draft.assigneeId,
            parentId = draft.parentId,
            collectionId = draft.collectionId,
            categoryId = draft.categoryId,
            title = draft.title,
            isPrivate = draft.isPrivate,
            boardId = draft.boardId,
            position = draft.position,
            createdAt = NOW,
            updatedAt = NOW,
        )
        tasks.update { it + task }
        return task
    }

    override suspend fun deleteTask(id: String): DeletedTaskSnapshot {
        deletedIds += id
        deleteGate?.await()
        failWith?.let { throw it }
        val row = tasks.value.first { it.id == id }
        val gone = HashSet<String>().apply { add(id) }
        // The DB cascades the subtree.
        while (true) {
            val more = tasks.value.filter { it.parentId in gone && it.id !in gone }.map { it.id }
            if (more.isEmpty()) break
            gone += more
        }
        tasks.update { rows -> rows.filter { it.id !in gone } }
        deletedRows[id] = row
        return DeletedTaskSnapshot(listOf(JsonObject(mapOf("id" to JsonPrimitive(id)))))
    }

    override suspend fun restoreTask(snapshot: DeletedTaskSnapshot) {
        failWith?.let { throw it }
        snapshot.tasks.forEach { row ->
            val id = row.getValue("id").jsonPrimitive.content
            restoredIds += id
            tasks.update { it + deletedRows.getValue(id) }
        }
    }

    override suspend fun hasCalendarBlocks(taskIds: Collection<String>): Boolean {
        blockChecks += taskIds
        failWith?.let { throw it }
        return taskIds.any { it in blockedTaskIds }
    }

    private fun replace(task: Task) = tasks.update { rows -> rows.map { if (it.id == task.id) task else it } }

    private fun <T> PatchField<T>.valueOr(fallback: T): T = if (this is PatchField.Value<T>) value else fallback
}
