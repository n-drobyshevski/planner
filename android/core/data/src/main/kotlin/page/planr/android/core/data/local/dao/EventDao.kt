package page.planr.android.core.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import page.planr.android.core.data.local.entity.EventEntity
import page.planr.android.core.data.local.entity.EventOverrideEntity

/**
 * Events and their overrides. The window predicate is `fetchWindow`'s:
 * `starts_at < end` and (series: not ended before `start`; single: `ends_at >= start`).
 */
@Dao
abstract class EventDao {

    @Query(
        """
        SELECT * FROM events WHERE $IN_WINDOW ORDER BY starts_at
        """,
    )
    abstract fun observeWindow(workspaceId: String, start: Long, end: Long): Flow<List<EventEntity>>

    @Query("SELECT * FROM events WHERE $IN_WINDOW")
    abstract suspend fun eventsInWindow(workspaceId: String, start: Long, end: Long): List<EventEntity>

    @Query("SELECT * FROM event_overrides WHERE event_id IN (SELECT id FROM events WHERE $IN_WINDOW)")
    abstract suspend fun overridesInWindow(workspaceId: String, start: Long, end: Long): List<EventOverrideEntity>

    @Query("SELECT id FROM events WHERE $IN_WINDOW")
    abstract suspend fun idsInWindow(workspaceId: String, start: Long, end: Long): List<String>

    @Query(
        """
        SELECT * FROM event_overrides
        WHERE event_id IN (SELECT id FROM events WHERE $IN_WINDOW)
        """,
    )
    abstract fun observeOverridesInWindow(workspaceId: String, start: Long, end: Long): Flow<List<EventOverrideEntity>>

    @Query("SELECT * FROM events WHERE id = :id")
    abstract fun observeById(id: String): Flow<EventEntity?>

    /** A task's calendar blocks (events linked by `task_id`), by start. */
    @Query("SELECT * FROM events WHERE workspace_id = :workspaceId AND task_id = :taskId ORDER BY starts_at")
    abstract fun observeOfTask(workspaceId: String, taskId: String): Flow<List<EventEntity>>

    @Query("SELECT id FROM events WHERE workspace_id = :workspaceId AND task_id = :taskId")
    abstract suspend fun idsOfTask(workspaceId: String, taskId: String): List<String>

    @Query("SELECT * FROM events WHERE id = :id")
    abstract suspend fun getById(id: String): EventEntity?

    @Query("SELECT * FROM event_overrides WHERE event_id = :eventId ORDER BY occurrence_date")
    abstract fun observeOverridesFor(eventId: String): Flow<List<EventOverrideEntity>>

    @Upsert
    abstract suspend fun upsertEvents(rows: List<EventEntity>)

    @Upsert
    protected abstract suspend fun upsertOverrideRows(rows: List<EventOverrideEntity>)

    @Query(
        """
        DELETE FROM event_overrides
        WHERE event_id = :eventId AND occurrence_date = :occurrenceDate AND id <> :keepId
        """,
    )
    protected abstract suspend fun deleteOtherOverridesAt(eventId: String, occurrenceDate: Long, keepId: String)

    /**
     * Upserts overrides, replacing any cached row for the same occurrence
     * under another id. Room's @Upsert falls back to `UPDATE … WHERE id = new`
     * on the (event_id, occurrence_date) unique-index conflict, which matches
     * nothing — so without this the newer row (e.g. re-created after the old
     * one was deleted elsewhere) would be silently dropped.
     */
    @Transaction
    open suspend fun upsertOverrides(rows: List<EventOverrideEntity>) {
        rows.forEach { deleteOtherOverridesAt(it.eventId, it.occurrenceDate, it.id) }
        upsertOverrideRows(rows)
    }

    @Query("DELETE FROM events WHERE id IN (:ids)")
    abstract suspend fun deleteEvents(ids: List<String>)

    @Query("DELETE FROM events WHERE task_id IN (:taskIds)")
    abstract suspend fun deleteEventsOfTasks(taskIds: List<String>)

    @Query("DELETE FROM event_overrides WHERE event_id IN (:eventIds)")
    abstract suspend fun deleteOverridesOf(eventIds: List<String>)

    @Query("DELETE FROM event_overrides WHERE id = :id")
    abstract suspend fun deleteOverride(id: String)

    @Query("DELETE FROM event_overrides WHERE event_id = :eventId AND occurrence_date = :occurrenceDate")
    abstract suspend fun deleteOverrideAt(eventId: String, occurrenceDate: Long)

    private companion object {
        const val IN_WINDOW = """
            workspace_id = :workspaceId AND starts_at < :end AND (
                (is_recurring = 1 AND (recurrence_ends_at IS NULL OR recurrence_ends_at >= :start))
                OR (is_recurring = 0 AND ends_at >= :start)
            )
        """
    }
}
