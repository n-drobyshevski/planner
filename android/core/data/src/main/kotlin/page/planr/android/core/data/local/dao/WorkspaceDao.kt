package page.planr.android.core.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import page.planr.android.core.data.local.entity.BoardEntity
import page.planr.android.core.data.local.entity.CategoryEntity
import page.planr.android.core.data.local.entity.MemberEntity

/** Members, categories and boards: the workspace reference data (`fetchWorkspaceBundle`). */
@Dao
abstract class WorkspaceDao {

    @Query("SELECT * FROM members WHERE workspace_id = :workspaceId ORDER BY created_at")
    abstract fun observeMembers(workspaceId: String): Flow<List<MemberEntity>>

    @Query("SELECT * FROM categories WHERE workspace_id = :workspaceId ORDER BY sort_order")
    abstract fun observeCategories(workspaceId: String): Flow<List<CategoryEntity>>

    @Query("SELECT * FROM boards WHERE workspace_id = :workspaceId ORDER BY position")
    abstract fun observeBoards(workspaceId: String): Flow<List<BoardEntity>>

    @Query("SELECT * FROM members WHERE workspace_id = :workspaceId")
    abstract suspend fun members(workspaceId: String): List<MemberEntity>

    @Query("SELECT * FROM categories WHERE workspace_id = :workspaceId")
    abstract suspend fun categories(workspaceId: String): List<CategoryEntity>

    @Query("SELECT * FROM boards WHERE workspace_id = :workspaceId")
    abstract suspend fun boards(workspaceId: String): List<BoardEntity>

    @Query("SELECT * FROM boards WHERE collection_id = :collectionId ORDER BY position")
    abstract suspend fun boardsOf(collectionId: String): List<BoardEntity>

    @Upsert
    abstract suspend fun upsertMembers(rows: List<MemberEntity>)

    @Upsert
    abstract suspend fun upsertCategories(rows: List<CategoryEntity>)

    @Upsert
    abstract suspend fun upsertBoards(rows: List<BoardEntity>)

    @Query("DELETE FROM categories WHERE id = :id")
    abstract suspend fun deleteCategory(id: String)

    @Query("DELETE FROM boards WHERE id = :id")
    abstract suspend fun deleteBoard(id: String)

    @Query("DELETE FROM members WHERE workspace_id = :workspaceId")
    protected abstract suspend fun clearMembers(workspaceId: String)

    @Query("DELETE FROM categories WHERE workspace_id = :workspaceId")
    protected abstract suspend fun clearCategories(workspaceId: String)

    @Query("DELETE FROM boards WHERE workspace_id = :workspaceId")
    protected abstract suspend fun clearBoards(workspaceId: String)

    /** Replaces the workspace's reference data with a fresh server snapshot. */
    @Transaction
    open suspend fun replaceAll(
        workspaceId: String,
        members: List<MemberEntity>,
        categories: List<CategoryEntity>,
        boards: List<BoardEntity>,
    ) {
        clearMembers(workspaceId)
        clearCategories(workspaceId)
        clearBoards(workspaceId)
        upsertMembers(members)
        upsertCategories(categories)
        upsertBoards(boards)
    }

    /**
     * [replaceAll], unless the cache already holds exactly these rows: then
     * nothing is written (no observer wakes up) and the result is false.
     */
    @Transaction
    open suspend fun replaceIfChanged(
        workspaceId: String,
        members: List<MemberEntity>,
        categories: List<CategoryEntity>,
        boards: List<BoardEntity>,
    ): Boolean {
        val same = sameRows(members(workspaceId), members) &&
            sameRows(categories(workspaceId), categories) &&
            sameRows(boards(workspaceId), boards)
        if (same) return false
        replaceAll(workspaceId, members, categories, boards)
        return true
    }
}
