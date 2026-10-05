package page.planr.android.core.data.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
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
import page.planr.android.core.data.prefs.DataStoreViewPreferences
import page.planr.android.core.data.prefs.ViewPreferences
import page.planr.android.core.data.prefs.ViewPreferencesDataStore

/** Device-local display preferences ([ViewPreferences]). */
@Module
@InstallIn(SingletonComponent::class)
abstract class PreferencesModule {

    @Binds
    abstract fun bindViewPreferences(impl: DataStoreViewPreferences): ViewPreferences

    companion object {
        @Provides
        @Singleton
        @ViewPreferencesDataStore
        fun provideViewPreferencesDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_view") },
            )
    }
}
