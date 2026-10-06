package page.planr.android.feature.inbox.data

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class InboxDataModule {
    @Binds
    abstract fun bindInboxDataSource(impl: RepositoryInboxDataSource): InboxDataSource
}
