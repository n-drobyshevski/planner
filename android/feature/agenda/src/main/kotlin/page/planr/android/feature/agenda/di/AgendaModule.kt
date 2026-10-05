package page.planr.android.feature.agenda.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import page.planr.android.feature.agenda.data.AgendaDataSource
import page.planr.android.feature.agenda.data.RepositoryAgendaDataSource
import page.planr.android.feature.agenda.importics.IcsImportDispatcher

@Module
@InstallIn(SingletonComponent::class)
abstract class AgendaModule {
    @Binds
    abstract fun bindAgendaDataSource(impl: RepositoryAgendaDataSource): AgendaDataSource

    companion object {
        @Provides
        @IcsImportDispatcher
        fun importDispatcher(): CoroutineDispatcher = Dispatchers.Default
    }
}
