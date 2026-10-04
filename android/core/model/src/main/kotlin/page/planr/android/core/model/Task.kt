package page.planr.android.core.model

import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * A `tasks` row. Mirrors `TaskRow` in lib/types.ts.
 *
 * There is no status column any more (dropped in 20260625000000_boards.sql): a
 * task's state is the board it sits in, and [completedAt] is set exactly when
 * that board is a done-board. [dueDate]/[startDate] are zone-free calendar
 * dates; "overdue" is judged in the viewer's zone.
 */
@Serializable
data class Task(
    val id: String,
    @SerialName("workspace_id") val workspaceId: String,
    /** Creator; drives edit rights. */
    @SerialName("owner_id") val ownerId: String,
    /** Responsible member; null = unassigned. */
    @SerialName("assignee_id") val assigneeId: String? = null,
    /** Subtask -> parent; null = top-level. */
    @SerialName("parent_id") val parentId: String? = null,
    @SerialName("collection_id") val collectionId: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    val title: String,
    val description: String? = null,
    @SerialName("is_private") val isPrivate: Boolean = true,
    val color: String? = null,
    @SerialName("board_id") val boardId: String? = null,
    /** 0..3 (DB CHECK); null = none. See [TaskPriority]. */
    val priority: Int? = null,
    @SerialName("due_date") val dueDate: LocalDate? = null,
    @SerialName("start_date") val startDate: LocalDate? = null,
    @SerialName("is_milestone") val isMilestone: Boolean = false,
    /** Order within its board column / among siblings. */
    val position: Double = 0.0,
    /** Parent only: subtasks must be completed in order. */
    val sequential: Boolean = false,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("completed_at") val completedAt: Instant? = null,
    val attributes: JsonObject = JsonObject(emptyMap()),
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("created_at") val createdAt: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("updated_at") val updatedAt: Instant,
) {
    val status: TaskStatus get() = if (completedAt != null) TaskStatus.Done else TaskStatus.Open

    val priorityLevel: TaskPriority get() = TaskPriority.fromValue(priority)
}

/** Derived completion state (the DB has no status column; see [Task]). */
enum class TaskStatus { Open, Done }

/**
 * `tasks.priority` (smallint 0..3, null = none). The form offers 1..3; 0 is
 * legacy-legal and reads as [None], like the web's `task.priority ?? 0`.
 */
enum class TaskPriority(val value: Int?) {
    None(null),
    Low(1),
    Medium(2),
    High(3),
    ;

    companion object {
        fun fromValue(value: Int?): TaskPriority = when (value) {
            1 -> Low
            2 -> Medium
            3 -> High
            else -> None
        }
    }
}
