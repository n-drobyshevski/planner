package page.planr.android.feature.insights.data

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class InsightsDataModule {
    @Binds
    abstract fun bindInsightsDataSource(impl: RepositoryInsightsDataSource): InsightsDataSource
}
