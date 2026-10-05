package page.planr.android.core.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/*
 * Room mirrors of the Supabase rows the app caches. Each entity keeps the few
 * columns its queries filter / sort on (instants as epoch ms) plus `payload`:
 * the whole row as PlanrJson, decoded back into the :core:model type. That
 * keeps the cache lossless (every column, incl. ones the UI ignores today)
 * without a Room migration each time the web adds one.
 */

@Entity(tableName = "members", indices = [Index("workspace_id")])
data class MemberEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "created_at") val createdAt: Long?,
    val payload: String,
)

@Entity(tableName = "categories", indices = [Index("workspace_id")])
data class CategoryEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "owner_id") val ownerId: String?,
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
    val payload: String,
)

@Entity(tableName = "boards", indices = [Index("workspace_id"), Index("collection_id")])
data class BoardEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "collection_id") val collectionId: String,
    val position: Double,
    @ColumnInfo(name = "is_done") val isDone: Boolean,
    val payload: String,
)

@Entity(tableName = "events", indices = [Index("workspace_id", "starts_at"), Index("task_id")])
data class EventEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "starts_at") val startsAt: Long,
    @ColumnInfo(name = "ends_at") val endsAt: Long,
    @ColumnInfo(name = "is_recurring") val isRecurring: Boolean,
    @ColumnInfo(name = "recurrence_ends_at") val recurrenceEndsAt: Long?,
    @ColumnInfo(name = "task_id") val taskId: String?,
    val payload: String,
)

@Entity(
    tableName = "event_overrides",
    indices = [Index("event_id"), Index(value = ["event_id", "occurrence_date"], unique = true)],
)
data class EventOverrideEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "event_id") val eventId: String,
    @ColumnInfo(name = "occurrence_date") val occurrenceDate: Long,
    val payload: String,
)

@Entity(tableName = "tasks", indices = [Index("workspace_id"), Index("parent_id")])
data class TaskEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "parent_id") val parentId: String?,
    val position: Double,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "completed_at") val completedAt: Long?,
    /** ISO `yyyy-MM-dd`; sorts chronologically as text. */
    @ColumnInfo(name = "due_date") val dueDate: String?,
    val payload: String,
)
