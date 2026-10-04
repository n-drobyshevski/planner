package page.planr.android.core.data.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import page.planr.android.core.data.config.PlanrConfig
import page.planr.android.core.model.PlanrJson
import page.planr.android.core.recurrence.DefaultRecurrenceExpander
import page.planr.android.core.recurrence.RecurrenceExpander

/**
 * App-wide data bindings. The Supabase client, Room database, repositories and
 * auth/session bindings are added here (or in sibling modules) in Phase 2/3.
 */
@Module
@InstallIn(SingletonComponent::class)
object DataModule {

    @Provides
    @Singleton
    fun providePlanrConfig(): PlanrConfig = PlanrConfig.fromBuildConfig()

    @Provides
    fun provideJson(): Json = PlanrJson

    @Provides
    fun provideRecurrenceExpander(): RecurrenceExpander = DefaultRecurrenceExpander
}
