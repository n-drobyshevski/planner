package page.planr.android.core.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import java.io.IOException
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/** What the Insights numbers count, for one viewer. */
data class InsightsFilterPrefs(
    /** Category ids left out of the numbers. */
    val hiddenCategoryIds: Set<String> = emptySet(),
    /** Count grayed-out blocks (e.g. sleep) too. */
    val includeInactive: Boolean = false,
)

/**
 * Insights filters per viewer: the web's localStorage
 * `planner:insights:filters:v1:{viewerId}`. Read from this device's DataStore;
 * [AppPrefsSync] keeps the signed-in member's in step with their account copy,
 * so they survive a reinstall.
 */
interface InsightsPreferences {
    fun filters(viewerId: String): Flow<InsightsFilterPrefs>

    suspend fun setHiddenCategories(viewerId: String, ids: Set<String>)

    suspend fun setIncludeInactive(viewerId: String, include: Boolean)
}

/** The plain (unencrypted) Insights-filters DataStore. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class InsightsPreferencesDataStore

@Singleton
class DataStoreInsightsPreferences @Inject constructor(
    @InsightsPreferencesDataStore private val dataStore: DataStore<Preferences>,
    private val changes: AppPrefsChanges,
) : InsightsPreferences {

    override fun filters(viewerId: String): Flow<InsightsFilterPrefs> =
        dataStore.data
            // A corrupt or unreadable file reads as the defaults.
            .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
            .map { prefs ->
                InsightsFilterPrefs(
                    hiddenCategoryIds = prefs[InsightsKeys.hidden(viewerId)] ?: emptySet(),
                    includeInactive = prefs[InsightsKeys.includeInactive(viewerId)] ?: false,
                )
            }
            .distinctUntilChanged()

    override suspend fun setHiddenCategories(viewerId: String, ids: Set<String>) {
        changes.localChange { dataStore.edit { it[InsightsKeys.hidden(viewerId)] = ids } }
    }

    override suspend fun setIncludeInactive(viewerId: String, include: Boolean) {
        changes.localChange { dataStore.edit { it[InsightsKeys.includeInactive(viewerId)] = include } }
    }
}
