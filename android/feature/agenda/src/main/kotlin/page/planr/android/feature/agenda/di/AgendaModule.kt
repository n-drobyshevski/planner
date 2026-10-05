package page.planr.android.feature.agenda.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import page.planr.android.feature.agenda.data.AgendaDataSource
import page.planr.android.feature.agenda.data.RepositoryAgendaDataSource

@Module
@InstallIn(SingletonComponent::class)
abstract class AgendaModule {
    @Binds
    abstract fun bindAgendaDataSource(impl: RepositoryAgendaDataSource): AgendaDataSource
}
