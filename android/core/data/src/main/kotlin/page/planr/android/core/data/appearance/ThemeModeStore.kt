package page.planr.android.core.data.appearance

import android.os.Build
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import java.io.IOException
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.runBlocking
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.model.ThemePreference

/** The device's appearance cache (`planr_appearance`). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AppearanceDataStore

/**
 * The member's `theme_preference` as last applied on this device, the app's
 * single source of truth for light / dark.
 *
 * From Android 12 the platform keeps the app's night mode itself
 * (UiModeManager.setApplicationNightMode, see [MemberAppearanceApplier]), so
 * the configuration, windows and system bars already match and [forcedDark] is
 * always null. Before that, nothing outside the app knows the preference:
 * activities pass [forcedDark] to PlanrTheme and the system bars, and it is
 * read once, blocking, on first use, so a cold start draws the right theme
 * from the first frame. The file holds one short string.
 */
@Singleton
class ThemeModeStore @Inject constructor(
    @AppearanceDataStore private val dataStore: DataStore<Preferences>,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private val preference: Flow<ThemePreference?> =
        dataStore.data
            // A corrupt or unreadable file reads as nothing applied yet.
            .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
            .map { prefs -> prefs[THEME]?.let { name -> ThemePreference.entries.firstOrNull { it.name == name } } }
            .distinctUntilChanged()

    /** true / false pins dark / light; null follows the configuration (`isSystemInDarkTheme()`). */
    val forcedDark: StateFlow<Boolean?> by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MutableStateFlow(null)
        } else {
            val forced = preference.map { it?.forcedDark() }
            forced.stateIn(scope, SharingStarted.Eagerly, runBlocking { forced.first() })
        }
    }

    /** The preference last handed to the platform; null before the member's row first loaded. */
    suspend fun lastApplied(): ThemePreference? = preference.first()

    suspend fun save(preference: ThemePreference) {
        dataStore.edit { it[THEME] = preference.name }
    }

    private companion object {
        val THEME = stringPreferencesKey("theme_preference")
    }
}
