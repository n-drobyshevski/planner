package page.planr.android.core.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import page.planr.android.core.data.sync.WidgetRefreshDispatcher

/** The agenda's period, as saved (`member_app_prefs.agenda_mode`). */
enum class AgendaViewMode(val wire: String) {
    Day("day"),
    Week("week"),
    ;

    companion object {
        /** Anything unknown reads as [Day], the default. */
        fun fromWire(value: String?): AgendaViewMode = entries.firstOrNull { it.wire == value } ?: Day
    }
}

/**
 * How the calendar is drawn, for the app and its widgets alike. Read from
 * this device's DataStore (instant, offline); [AppPrefsSync] keeps it in step
 * with the member's account copy, so it survives a reinstall.
 */
interface ViewPreferences {
    /**
     * Whether the partner's personal events show next to the viewer's own and
     * the joint ones (the web's "overlay" of the other member). Default on.
     */
    val showPartnerEvents: Flow<Boolean>

    /** Saves [show] and re-renders the widgets with it. */
    suspend fun setShowPartnerEvents(show: Boolean)

    /** The agenda's last-used period. Default [AgendaViewMode.Day]. */
    val agendaMode: Flow<AgendaViewMode>

    suspend fun setAgendaMode(mode: AgendaViewMode)
}

/** The plain (unencrypted) view-preferences DataStore. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ViewPreferencesDataStore

@Singleton
class DataStoreViewPreferences @Inject constructor(
    @ViewPreferencesDataStore private val dataStore: DataStore<Preferences>,
    private val widgets: WidgetRefreshDispatcher,
    private val changes: AppPrefsChanges,
) : ViewPreferences {

    override val showPartnerEvents: Flow<Boolean> =
        dataStore.data.map { it[ViewKeys.SHOW_PARTNER_EVENTS] ?: true }.distinctUntilChanged()

    override val agendaMode: Flow<AgendaViewMode> =
        dataStore.data.map { AgendaViewMode.fromWire(it[ViewKeys.AGENDA_MODE]) }.distinctUntilChanged()

    override suspend fun setShowPartnerEvents(show: Boolean) {
        changes.localChange { dataStore.edit { it[ViewKeys.SHOW_PARTNER_EVENTS] = show } }
        widgets.requestRefresh()
    }

    override suspend fun setAgendaMode(mode: AgendaViewMode) {
        changes.localChange { dataStore.edit { it[ViewKeys.AGENDA_MODE] = mode.wire } }
    }
}
