package page.planr.android.feature.tasks.data

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class TasksDataModule {
    @Binds
    abstract fun bindTasksDataSource(impl: RepositoryTasksDataSource): TasksDataSource
}
