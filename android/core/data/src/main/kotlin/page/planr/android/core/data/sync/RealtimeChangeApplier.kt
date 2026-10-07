package page.planr.android.core.data.sync

import androidx.room.withTransaction
import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.local.CacheArea
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.local.PlanrDatabase
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.decodeAs
import page.planr.android.core.data.remote.string
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PostgresInstantSerializer
import page.planr.android.core.model.Task

/** One Realtime row change, reduced to what the cache needs. */
sealed interface RowChange {
    /** INSERT / UPDATE: the full new row. */
    data class Upsert(val record: JsonObject) : RowChange

    /**
     * DELETE (or a row turned private, gone for this member): a record that
     * carries only `id`. Built from a [RowGone] broadcast ([gone]), since a
     * filtered Postgres Changes binding never sees a delete: see [RealtimeSync].
     */
    data class Delete(val oldRecord: JsonObject, val gone: RowGone? = null) : RowChange {
        /**
         * The row only turned private: the database removed nothing, so only
         * the row itself leaves the cache (a task's subtasks and calendar
         * blocks keep their own visibility; an event's overrides go with it).
         */
        val hidden: Boolean get() = gone?.kind == RowGone.Kind.Hidden
    }
}

/**
 * Applies Realtime `postgres_changes` to Room, table by table. Cascades the
 * database performs are mirrored where Realtime might not deliver every row
 * (an event's overrides, a task's linked blocks and subtasks).
 *
 * Changes can arrive out of order (and after the row a write returned was
 * already cached), so an event or task row older than the cached one is
 * skipped: see [isOutdated].
 */
class RealtimeChangeApplier @Inject constructor(
    private val db: PlanrDatabase,
    private val gate: CacheGate,
) {

    /**
     * Returns true when the change touched the cache. [ticket] is taken when
     * the channel joined: a change still being delivered after a sign-out
     * wiped the cache is dropped (null: take one now).
     */
    suspend fun apply(table: String, change: RowChange, ticket: CacheGate.Ticket? = null): Boolean {
        val area = areaOf(table) ?: return false
        var applied = false
        gate.change(ticket ?: gate.ticket(), *area) {
            applied = when (change) {
                is RowChange.Upsert -> upsert(table, change.record)
                is RowChange.Delete -> change.oldRecord.string("id")?.let { delete(table, it, change.hidden) } ?: false
            }
        }
        return applied
    }

    private fun areaOf(table: String): Array<CacheArea>? = when (table) {
        SupabaseTables.EVENTS, SupabaseTables.EVENT_OVERRIDES -> arrayOf(CacheArea.Events)
        // A task delete also removes its linked calendar blocks.
        SupabaseTables.TASKS -> arrayOf(CacheArea.Tasks, CacheArea.Events)
        SupabaseTables.CATEGORIES, SupabaseTables.BOARDS -> arrayOf(CacheArea.Workspace)
        else -> null
    }

    private suspend fun upsert(table: String, record: JsonObject): Boolean {
        when (table) {
            SupabaseTables.EVENTS -> {
                val cached = record.string("id")?.let { db.eventDao().getById(it) }
                if (isOutdated(record.updatedAt(), cached?.let { runCatching { it.toModel().updatedAt }.getOrNull() })) {
                    return false
                }
                db.eventDao().upsertEvents(listOf(record.decodeAs(PlannerEvent.serializer()).toEntity()))
            }
            SupabaseTables.EVENT_OVERRIDES ->
                db.eventDao().upsertOverrides(listOf(record.decodeAs(EventOverride.serializer()).toEntity()))
            SupabaseTables.TASKS -> {
                val cached = record.string("id")?.let { db.taskDao().getById(it) }
                if (isOutdated(record.updatedAt(), cached?.let { runCatching { it.toModel().updatedAt }.getOrNull() })) {
                    return false
                }
                db.taskDao().upsert(listOf(record.decodeAs(Task.serializer()).toEntity()))
            }
            SupabaseTables.CATEGORIES ->
                db.workspaceDao().upsertCategories(listOf(record.decodeAs(Category.serializer()).toEntity()))
            SupabaseTables.BOARDS ->
                db.workspaceDao().upsertBoards(listOf(record.decodeAs(Board.serializer()).toEntity()))
            else -> return false
        }
        return true
    }

    /** Mirrors what the database cascades from a delete; a row turned private ([hidden]) only takes itself. */
    private suspend fun delete(table: String, id: String, hidden: Boolean): Boolean {
        when (table) {
            SupabaseTables.EVENTS -> db.withTransaction {
                db.eventDao().deleteOverridesOf(listOf(id))
                db.eventDao().deleteEvents(listOf(id))
            }
            SupabaseTables.EVENT_OVERRIDES -> db.eventDao().deleteOverride(id)
            SupabaseTables.TASKS -> if (hidden) {
                db.taskDao().delete(listOf(id))
            } else {
                db.withTransaction {
                    val ids = db.taskDao().subtreeIds(id)
                    db.eventDao().deleteEventsOfTasks(ids)
                    db.taskDao().delete(ids)
                }
            }
            SupabaseTables.CATEGORIES -> db.workspaceDao().deleteCategory(id)
            SupabaseTables.BOARDS -> db.workspaceDao().deleteBoard(id)
            else -> return false
        }
        return true
    }

    /** The row's `updated_at`; null when missing or unreadable. */
    private fun JsonObject.updatedAt(): Instant? =
        string("updated_at")?.let { runCatching { PostgresInstantSerializer.parse(it) }.getOrNull() }

    companion object {
        /**
         * True when an incoming row is older than the cached one: an
         * out-of-order echo that would revert a newer change. The same
         * `updated_at` applies (a repeat is harmless), and so does a row
         * when either time is unknown. Sound because the server's
         * `set_updated_at()` makes a row's `updated_at` grow in commit order
         * (migration `20261008000000_monotonic_updated_at`): a plain `now()`
         * is the transaction's start, so of two saves racing on one row the
         * one committed last could carry the older time and be skipped here.
         */
        internal fun isOutdated(incoming: Instant?, cached: Instant?): Boolean =
            incoming != null && cached != null && incoming < cached

        /** The v1 subset of lib/supabase/realtime.ts's tables. */
        val TABLES = listOf(
            SupabaseTables.EVENTS,
            SupabaseTables.EVENT_OVERRIDES,
            SupabaseTables.CATEGORIES,
            SupabaseTables.BOARDS,
            SupabaseTables.TASKS,
        )
    }
}
