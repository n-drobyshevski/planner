package page.planr.android.core.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import page.planr.android.core.data.local.dao.EventDao
import page.planr.android.core.data.local.dao.TaskDao
import page.planr.android.core.data.local.dao.WorkspaceDao
import page.planr.android.core.data.local.entity.BoardEntity
import page.planr.android.core.data.local.entity.CategoryEntity
import page.planr.android.core.data.local.entity.EventEntity
import page.planr.android.core.data.local.entity.EventOverrideEntity
import page.planr.android.core.data.local.entity.MemberEntity
import page.planr.android.core.data.local.entity.TaskEntity

/**
 * The local cache: the single source of truth the UI and widgets read. It is
 * a cache, not an outbox — every row can be refetched, so a schema change may
 * simply drop and rebuild (see the builder in DatabaseModule).
 */
@Database(
    entities = [
        MemberEntity::class,
        CategoryEntity::class,
        BoardEntity::class,
        EventEntity::class,
        EventOverrideEntity::class,
        TaskEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class PlanrDatabase : RoomDatabase() {
    abstract fun workspaceDao(): WorkspaceDao

    abstract fun eventDao(): EventDao

    abstract fun taskDao(): TaskDao

    companion object {
        const val NAME = "planr.db"
    }
}
