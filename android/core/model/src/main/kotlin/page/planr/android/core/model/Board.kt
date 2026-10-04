package page.planr.android.core.model

import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A `boards` row: one column/state of a collection. A task is complete when it
 * sits on a board with [isDone]; completing a task moves it to its collection's
 * first done-board (see `complete_task` in lib/mcp/tools.ts).
 */
@Serializable
data class Board(
    val id: String,
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("collection_id") val collectionId: String,
    val name: String,
    @SerialName("line_style") val lineStyle: String = "solid",
    val position: Double = 0.0,
    @SerialName("is_done") val isDone: Boolean = false,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("created_at") val createdAt: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("updated_at") val updatedAt: Instant,
)
