package page.planr.android.core.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import page.planr.android.core.data.sync.WidgetRefreshDispatcher

/**
 * How this device draws the calendar, for the app and its widgets alike.
 * Device-local, like the web's sidebar toggles (they live in its UI store and
 * never reach the server).
 */
interface ViewPreferences {
    /**
     * Whether the partner's personal events show next to the viewer's own and
     * the joint ones (the web's "overlay" of the other member). Default on.
     */
    val showPartnerEvents: Flow<Boolean>

    /** Saves [show] and re-renders the widgets with it. */
    suspend fun setShowPartnerEvents(show: Boolean)
}

/** The plain (unencrypted) view-preferences DataStore. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ViewPreferencesDataStore

@Singleton
class DataStoreViewPreferences @Inject constructor(
    @ViewPreferencesDataStore private val dataStore: DataStore<Preferences>,
    private val widgets: WidgetRefreshDispatcher,
) : ViewPreferences {

    override val showPartnerEvents: Flow<Boolean> =
        dataStore.data.map { it[SHOW_PARTNER_EVENTS] ?: true }.distinctUntilChanged()

    override suspend fun setShowPartnerEvents(show: Boolean) {
        dataStore.edit { it[SHOW_PARTNER_EVENTS] = show }
        widgets.requestRefresh()
    }

    private companion object {
        val SHOW_PARTNER_EVENTS = booleanPreferencesKey("show_partner_events")
    }
}
