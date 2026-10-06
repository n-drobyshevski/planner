package page.planr.android.core.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import page.planr.android.core.data.local.entity.TaskEntity

/** Tasks, ordered like `fetchTasks` (position, then created_at). */
@Dao
abstract class TaskDao {

    @Query("SELECT * FROM tasks WHERE workspace_id = :workspaceId ORDER BY position, created_at")
    abstract fun observeAll(workspaceId: String): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE workspace_id = :workspaceId")
    abstract suspend fun getAll(workspaceId: String): List<TaskEntity>

    @Query("SELECT * FROM tasks WHERE id = :id")
    abstract fun observeById(id: String): Flow<TaskEntity?>

    @Query("SELECT * FROM tasks WHERE id = :id")
    abstract suspend fun getById(id: String): TaskEntity?

    @Query("SELECT id FROM tasks WHERE parent_id IN (:parentIds)")
    abstract suspend fun childIds(parentIds: List<String>): List<String>

    @Upsert
    abstract suspend fun upsert(rows: List<TaskEntity>)

    @Query("DELETE FROM tasks WHERE id IN (:ids)")
    abstract suspend fun delete(ids: List<String>)

    @Query("DELETE FROM tasks WHERE workspace_id = :workspaceId")
    protected abstract suspend fun clear(workspaceId: String)

    /** Replaces the workspace's tasks with a fresh server snapshot. */
    @Transaction
    open suspend fun replaceAll(workspaceId: String, rows: List<TaskEntity>) {
        clear(workspaceId)
        upsert(rows)
    }

    /**
     * [replaceAll], unless the cache already holds exactly [rows]: then
     * nothing is written (no observer wakes up) and the result is false.
     */
    @Transaction
    open suspend fun replaceIfChanged(workspaceId: String, rows: List<TaskEntity>): Boolean {
        if (sameRows(getAll(workspaceId), rows)) return false
        replaceAll(workspaceId, rows)
        return true
    }

    /** [id] and all its descendants (`parent_id` chain), parent first. */
    @Transaction
    open suspend fun subtreeIds(id: String): List<String> {
        val all = mutableListOf(id)
        var frontier = listOf(id)
        while (frontier.isNotEmpty()) {
            frontier = childIds(frontier).filterNot { it in all }
            all += frontier
        }
        return all
    }
}
