package page.planr.android.core.data.sync

import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.remote.string
import page.planr.android.core.model.PostgresInstantSerializer

/**
 * A row that left the workspace's view, from the server's `row_gone`
 * broadcast on the private `workspace:<id>:sync` topic (migration
 * `20261009000000_broadcast_deletes_and_editor`).
 *
 * [title], [start] and [end] describe what went, for the partner-change
 * notifier: only an events/tasks delete of a row that was not private
 * carries them ([start]/[end] for events only).
 */
data class RowGone(
    val table: String,
    val id: String,
    val kind: Kind,
    /** The row's owner; null for shared rows and tables without one. */
    val ownerId: String?,
    /** The member whose write removed it; null for a service or cron write. */
    val actor: String?,
    val title: String? = null,
    val start: Instant? = null,
    val end: Instant? = null,
) {
    enum class Kind {
        /** The row was deleted. */
        Delete,

        /** The row turned private: only its owner can see it now. */
        Hidden,
    }

    /**
     * Whether the viewer [memberId] should drop the row from their cache: a
     * delete always; a row turned private unless it is the viewer's own (an
     * unknown viewer drops it too: a stale row of theirs comes back on the
     * next refetch, a partner's private one must not linger).
     */
    fun removesFor(memberId: String?): Boolean = when (kind) {
        Kind.Delete -> true
        Kind.Hidden -> memberId == null || ownerId != memberId
    }

    /**
     * The cache change that drops the row: with what the database cascades
     * from a delete, or the row alone when it only turned private.
     */
    fun toDelete(): RowChange.Delete = RowChange.Delete(JsonObject(mapOf("id" to JsonPrimitive(id))), gone = this)

    companion object {
        /** The broadcast event name the triggers send. */
        const val EVENT = "row_gone"

        /** The private topic the triggers send to (RLS on realtime.messages admits members only). */
        fun topic(workspaceId: String): String = "workspace:$workspaceId:sync"

        /** [payload] as a [RowGone], or null when it is malformed or of an unknown kind. */
        fun parse(payload: JsonObject): RowGone? {
            // Some transports wrap the message in an envelope; the fields sit one level down then.
            val fields = (payload["payload"] as? JsonObject)?.takeIf { "table" !in payload } ?: payload
            val table = fields.string("table")?.takeIf { it.isNotEmpty() } ?: return null
            val id = fields.string("id")?.takeIf { it.isNotEmpty() } ?: return null
            val kind = when (fields.string("kind")) {
                "delete" -> Kind.Delete
                "hidden" -> Kind.Hidden
                else -> return null
            }
            return RowGone(
                table = table,
                id = id,
                kind = kind,
                ownerId = fields.string("owner_id"),
                actor = fields.string("actor"),
                title = fields.string("title"),
                start = fields.instant("starts_at"),
                end = fields.instant("ends_at"),
            )
        }

        private fun JsonObject.instant(key: String): Instant? =
            string(key)?.let { runCatching { PostgresInstantSerializer.parse(it) }.getOrNull() }
    }
}
