package page.planr.android.feature.tasks.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Qualifier
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

/** The dispatcher the tasks list is built on (off the main thread). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class TasksCompute

@Module
@InstallIn(SingletonComponent::class)
abstract class TasksDataModule {
    @Binds
    abstract fun bindTasksDataSource(impl: RepositoryTasksDataSource): TasksDataSource

    companion object {
        @Provides
        @TasksCompute
        fun computeDispatcher(): CoroutineDispatcher = Dispatchers.Default
    }
}
