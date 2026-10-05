package page.planr.android.core.data.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import page.planr.android.core.data.config.PlanrConfig
import page.planr.android.core.model.PlanrJson
import page.planr.android.core.recurrence.DefaultRecurrenceExpander
import page.planr.android.core.recurrence.RecurrenceExpander

/**
 * App-wide data bindings. Supabase, Room, auth and widget bindings live in the
 * sibling modules (SupabaseModule, DatabaseModule, AuthModule, WidgetModule,
 * PreferencesModule).
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

    @Provides
    fun provideClock(): Clock = Clock.System

    @Provides
    @Singleton
    @ApplicationScope
    fun provideApplicationScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
}
