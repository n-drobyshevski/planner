package page.planr.android.core.data.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import page.planr.android.core.data.local.PlanrDatabase
import page.planr.android.core.data.local.dao.EventDao
import page.planr.android.core.data.local.dao.TaskDao
import page.planr.android.core.data.local.dao.WorkspaceDao

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    /** A pure cache of server rows: on a schema bump, drop and refetch. */
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): PlanrDatabase =
        Room.databaseBuilder(context, PlanrDatabase::class.java, PlanrDatabase.NAME)
            .fallbackToDestructiveMigration(dropAllTables = true)
            .build()

    @Provides
    fun provideWorkspaceDao(db: PlanrDatabase): WorkspaceDao = db.workspaceDao()

    @Provides
    fun provideEventDao(db: PlanrDatabase): EventDao = db.eventDao()

    @Provides
    fun provideTaskDao(db: PlanrDatabase): TaskDao = db.taskDao()
}
