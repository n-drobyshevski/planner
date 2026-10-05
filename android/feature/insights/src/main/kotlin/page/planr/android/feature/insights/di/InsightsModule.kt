package page.planr.android.feature.insights.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Qualifier
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import page.planr.android.feature.insights.model.DefaultInsightsModelFactory
import page.planr.android.feature.insights.model.InsightsModelFactory

/** The dispatcher Insights recomputes its models on (off the main thread). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class InsightsCompute

@Module
@InstallIn(SingletonComponent::class)
abstract class InsightsModule {

    @Binds
    abstract fun bindModelFactory(impl: DefaultInsightsModelFactory): InsightsModelFactory

    companion object {
        @Provides
        @InsightsCompute
        fun computeDispatcher(): CoroutineDispatcher = Dispatchers.Default
    }
}
