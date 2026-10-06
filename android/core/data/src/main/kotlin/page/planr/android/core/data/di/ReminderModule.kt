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
import dagger.multibindings.IntoSet
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import page.planr.android.core.data.reminders.CacheReminderSource
import page.planr.android.core.data.reminders.DataStoreReminderStore
import page.planr.android.core.data.reminders.ReminderDataStore
import page.planr.android.core.data.reminders.ReminderRefresher
import page.planr.android.core.data.reminders.ReminderSource
import page.planr.android.core.data.reminders.ReminderStore
import page.planr.android.core.data.sync.WidgetRefresher

/**
 * Event reminders: the per-device store, the cache they are planned from,
 * and a re-plan wherever the widgets refresh. The app supplies the
 * `AlarmPort` (AlarmManager and its receiver).
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class ReminderModule {

    @Binds
    abstract fun bindReminderSource(impl: CacheReminderSource): ReminderSource

    @Binds
    abstract fun bindReminderStore(impl: DataStoreReminderStore): ReminderStore

    @Binds
    @IntoSet
    abstract fun bindReminderRefresher(impl: ReminderRefresher): WidgetRefresher

    companion object {
        @Provides
        @Singleton
        @ReminderDataStore
        fun provideReminderDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_reminders") },
            )
    }
}
