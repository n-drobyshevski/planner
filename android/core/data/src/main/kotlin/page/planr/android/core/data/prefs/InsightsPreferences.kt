package page.planr.android.core.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringSetPreferencesKey
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
 * Insights filters per viewer per device: the web's localStorage
 * `planner:insights:filters:v1:{viewerId}`. Keyed by viewer, so they survive a
 * sign-out like the web's do.
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
) : InsightsPreferences {

    override fun filters(viewerId: String): Flow<InsightsFilterPrefs> =
        dataStore.data
            // A corrupt or unreadable file reads as the defaults.
            .catch { e -> if (e is IOException) emit(emptyPreferences()) else throw e }
            .map { prefs ->
                InsightsFilterPrefs(
                    hiddenCategoryIds = prefs[hiddenKey(viewerId)] ?: emptySet(),
                    includeInactive = prefs[includeInactiveKey(viewerId)] ?: false,
                )
            }
            .distinctUntilChanged()

    override suspend fun setHiddenCategories(viewerId: String, ids: Set<String>) {
        dataStore.edit { it[hiddenKey(viewerId)] = ids }
    }

    override suspend fun setIncludeInactive(viewerId: String, include: Boolean) {
        dataStore.edit { it[includeInactiveKey(viewerId)] = include }
    }

    private companion object {
        fun hiddenKey(viewerId: String) = stringSetPreferencesKey("hidden_categories:$viewerId")

        fun includeInactiveKey(viewerId: String) = booleanPreferencesKey("include_inactive:$viewerId")
    }
}
