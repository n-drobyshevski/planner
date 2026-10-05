package page.planr.android.widgets

import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task

/** A two-member workspace in Berlin (UTC+2 in October). */
object WidgetFixtures {
    const val WORKSPACE = "ws-1"
    const val ANNA = "member-a"
    const val BORIS = "member-b"

    val anna = Member(id = ANNA, workspaceId = WORKSPACE, name = "Anna", color = "#c0492a")
    val boris = Member(id = BORIS, workspaceId = WORKSPACE, name = "Boris", color = "#0f766e")

    val home = Category(id = "cat-home", workspaceId = WORKSPACE, ownerId = null, name = "Home", color = "#15803d")
    val borisWork = Category(id = "cat-work", workspaceId = WORKSPACE, ownerId = BORIS, name = "Work", color = "#0369a1")

    private val created = Instant.parse("2026-09-01T08:00:00Z")

    fun occurrence(
        key: String,
        start: String,
        end: String,
        title: String = key,
        owner: String = ANNA,
        allDay: Boolean = false,
        isShared: Boolean = false,
        kind: EventKind = EventKind.Event,
        status: EventStatus = EventStatus.Confirmed,
        inactive: Boolean = false,
    ) = Occurrence(
        key = key,
        eventId = key.substringBefore(':'),
        occurrenceDate = Instant.parse(start),
        start = Instant.parse(start),
        end = Instant.parse(end),
        allDay = allDay,
        inactive = inactive,
        status = status,
        title = title,
        description = null,
        location = null,
        categoryId = null,
        color = null,
        kind = kind,
        ownerId = owner,
        isPrivate = false,
        isShared = isShared,
        hiddenFromPublic = false,
        taskId = null,
        attributes = JsonObject(emptyMap()),
        isRecurring = key.contains(':'),
        isException = false,
    )

    /** A collection with an open and a done column (tasks default into it). */
    const val COLLECTION = "col"

    val columns = listOf(column("todo", 0.0, done = false), column("done", 1.0, done = true))

    private fun column(id: String, position: Double, done: Boolean) = Board(
        id = id,
        workspaceId = WORKSPACE,
        collectionId = COLLECTION,
        name = id,
        position = position,
        isDone = done,
        createdAt = created,
        updatedAt = created,
    )

    fun task(
        id: String,
        owner: String = ANNA,
        assignee: String? = null,
        parent: String? = null,
        category: String? = null,
        due: LocalDate? = null,
        priority: Int? = null,
        position: Double = 0.0,
        done: Boolean = false,
        collection: String? = COLLECTION,
    ) = Task(
        id = id,
        workspaceId = WORKSPACE,
        ownerId = owner,
        assigneeId = assignee,
        parentId = parent,
        collectionId = collection,
        categoryId = category,
        title = id,
        priority = priority,
        dueDate = due,
        position = position,
        completedAt = if (done) Instant.parse("2026-10-04T10:00:00Z") else null,
        createdAt = created,
        updatedAt = created,
    )
}
