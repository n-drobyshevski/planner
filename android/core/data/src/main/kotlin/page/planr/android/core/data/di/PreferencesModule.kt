package page.planr.android.core.data.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import page.planr.android.core.data.appearance.AndroidAppearancePlatform
import page.planr.android.core.data.appearance.AppearanceDataStore
import page.planr.android.core.data.appearance.AppearancePlatform
import page.planr.android.core.data.health.CachedMemberZone
import page.planr.android.core.data.health.HealthConnectSleepSource
import page.planr.android.core.data.health.HealthPrefsDataStore
import page.planr.android.core.data.health.HealthSleepSource
import page.planr.android.core.data.health.MemberZone
import page.planr.android.core.data.health.RepositorySleepBlockCalendar
import page.planr.android.core.data.health.SleepBlockCalendar
import page.planr.android.core.data.prefs.AppPrefsChanges
import page.planr.android.core.data.prefs.AppPrefsSync
import page.planr.android.core.data.prefs.DataStoreInsightsPreferences
import page.planr.android.core.data.prefs.DataStoreViewPreferences
import page.planr.android.core.data.prefs.InsightsPreferences
import page.planr.android.core.data.prefs.InsightsPreferencesDataStore
import page.planr.android.core.data.prefs.LegacyAgendaMonthMigration
import page.planr.android.core.data.prefs.ViewPreferences
import page.planr.android.core.data.prefs.ViewPreferencesDataStore

/**
 * Display preferences ([ViewPreferences], [InsightsPreferences]), synced by
 * [AppPrefsSync], the per-device Health Connect connection, and the member's
 * appearance as last applied on this device.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class PreferencesModule {

    @Binds
    abstract fun bindViewPreferences(impl: DataStoreViewPreferences): ViewPreferences

    @Binds
    abstract fun bindAppPrefsChanges(impl: AppPrefsSync): AppPrefsChanges

    @Binds
    abstract fun bindInsightsPreferences(impl: DataStoreInsightsPreferences): InsightsPreferences

    @Binds
    abstract fun bindHealthSleepSource(impl: HealthConnectSleepSource): HealthSleepSource

    @Binds
    abstract fun bindMemberZone(impl: CachedMemberZone): MemberZone

    @Binds
    abstract fun bindSleepBlockCalendar(impl: RepositorySleepBlockCalendar): SleepBlockCalendar

    @Binds
    abstract fun bindAppearancePlatform(impl: AndroidAppearancePlatform): AppearancePlatform

    companion object {
        @Provides
        @Singleton
        @ViewPreferencesDataStore
        fun provideViewPreferencesDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                migrations = listOf(LegacyAgendaMonthMigration),
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_view") },
            )

        @Provides
        @Singleton
        @InsightsPreferencesDataStore
        fun provideInsightsPreferencesDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_insights") },
            )

        @Provides
        @Singleton
        @HealthPrefsDataStore
        fun provideHealthPrefsDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_health") },
            )

        @Provides
        @Singleton
        @AppearanceDataStore
        fun provideAppearanceDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_appearance") },
            )
    }
}
