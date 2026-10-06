package page.planr.android.feature.quickadd.data

import javax.inject.Inject
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.RowFilter
import page.planr.android.core.data.remote.RowOrder
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.repository.EventRepository
import page.planr.android.core.data.repository.TaskRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Board
import page.planr.android.core.model.PlanrJson
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.Task

/** The writes Quick add performs; a seam so the view model can be tested with a fake. */
interface QuickAddDataSource {
    /** The member's own zone when set, else the device zone. */
    suspend fun viewerZone(): TimeZone

    /** Throws NotSignedInException when there is no session. [description] is the notes, null for none. */
    suspend fun createTask(title: String, dueDate: LocalDate?, description: String?): Task

    suspend fun createEvent(
        title: String,
        start: Instant,
        end: Instant,
        allDay: Boolean,
        zone: TimeZone,
        description: String?,
    ): PlannerEvent

    /** Deletes a task this sheet just created (Undo). */
    suspend fun deleteTask(id: String)

    /** Deletes an event this sheet just created (Undo). */
    suspend fun deleteEvent(id: String)
}

/**
 * The production [QuickAddDataSource]. Writes need a connection (v1 has no
 * outbox), so a failure is thrown to the sheet.
 */
class RepositoryQuickAddDataSource @Inject constructor(
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val tasks: TaskRepository,
    private val events: EventRepository,
    private val gateway: PostgrestGateway,
    private val clock: Clock,
) : QuickAddDataSource {

    override suspend fun viewerZone(): TimeZone =
        workspace.observeCurrentMember().first()?.timezone
            ?.let { runCatching { TimeZone.of(it) }.getOrNull() }
            ?: TimeZone.currentSystemDefault()

    /**
     * A private task of the signed-in member, filed like the web's "new task"
     * from the calendar: into the default collection (the first shared one,
     * else the first) and its first column, so it shows on the web's Tasks
     * board and can be completed. New tasks sort to the bottom (position = now).
     */
    override suspend fun createTask(title: String, dueDate: LocalDate?, description: String?): Task {
        val current = session.requireSession()
        val board = defaultBoard()
        val now = clock.now()
        return tasks.createTask(
            TaskDraft(
                workspaceId = current.workspaceId,
                ownerId = current.memberId,
                title = title,
                description = description,
                dueDate = dueDate,
                collectionId = board?.collectionId,
                boardId = board?.id,
                position = now.toEpochMilliseconds().toDouble(),
                completedAt = if (board?.isDone == true) now else null,
            ),
        )
    }

    /** A visible (not private, not joint) event of the signed-in member, as the web's new-event defaults. */
    override suspend fun createEvent(
        title: String,
        start: Instant,
        end: Instant,
        allDay: Boolean,
        zone: TimeZone,
        description: String?,
    ): PlannerEvent {
        val current = session.requireSession()
        return events.createEvent(
            PlannerEventDraft(
                workspaceId = current.workspaceId,
                ownerId = current.memberId,
                title = title.trim(),
                description = description,
                allDay = allDay,
                start = start,
                end = end,
                timeZone = zone.id,
            ),
        )
    }

    /** Through the repository, so Room and the widgets drop it too. */
    override suspend fun deleteTask(id: String) {
        tasks.deleteTask(id)
    }

    /** The undo of a create: no snapshot to restore is kept. */
    override suspend fun deleteEvent(id: String) = events.deleteEvents(listOf(id))

    /**
     * The first column of the default collection (`defaultTaskCollectionId` in
     * calendar-shell.tsx). Collections aren't cached locally, so they're read
     * here; the columns come from Room, or the server when not yet synced.
     */
    private suspend fun defaultBoard(): Board? {
        val collections = gateway.select(
            SupabaseTables.COLLECTIONS,
            columns = "id,owner_id",
            order = listOf(RowOrder("sort_order")),
        )
        val collection = (collections.firstOrNull { it.text("owner_id") == null } ?: collections.firstOrNull())
            ?.text("id")
            ?: return null
        val cached = workspace.observeBoards().first().filter { it.collectionId == collection }
        val boards = cached.ifEmpty {
            gateway.select(
                SupabaseTables.BOARDS,
                filters = listOf(RowFilter.Eq("collection_id", collection)),
                order = listOf(RowOrder("position")),
            ).map { PlanrJson.decodeFromJsonElement(Board.serializer(), it) }
        }
        return boards.minByOrNull { it.position }
    }

    private fun JsonObject.text(column: String): String? = (this[column] as? JsonPrimitive)?.contentOrNull
}
