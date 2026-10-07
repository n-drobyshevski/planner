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
import page.planr.android.core.data.notify.AppForeground
import page.planr.android.core.data.notify.CacheNotifyAudience
import page.planr.android.core.data.notify.DataStoreNotifyPrefs
import page.planr.android.core.data.notify.NotifyAudience
import page.planr.android.core.data.notify.NotifyDataStore
import page.planr.android.core.data.notify.NotifyPrefs
import page.planr.android.core.data.notify.ProcessAppForeground

/**
 * The opt-in notifications (new time requests, the partner's changes): the
 * per-device store and what the notifiers read. The app supplies the
 * `NotificationPort` (the channels and the notifications themselves).
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class NotifyModule {

    @Binds
    abstract fun bindNotifyPrefs(impl: DataStoreNotifyPrefs): NotifyPrefs

    @Binds
    abstract fun bindNotifyAudience(impl: CacheNotifyAudience): NotifyAudience

    @Binds
    abstract fun bindAppForeground(impl: ProcessAppForeground): AppForeground

    companion object {
        @Provides
        @Singleton
        @NotifyDataStore
        fun provideNotifyDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_notify") },
            )
    }
}
