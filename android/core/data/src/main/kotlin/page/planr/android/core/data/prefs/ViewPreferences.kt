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
import page.planr.android.core.model.CalendarFilter

/**
 * The agenda's period, as saved (`member_app_prefs.agenda_mode`; the wire
 * values are the web calendar's view names).
 */
enum class AgendaViewMode(val wire: String) {
    Day("day"),
    Week("week"),
    Month("month"),
    ;

    /**
     * Whether the account copy can hold it: `member_app_prefs.agenda_mode`'s
     * check constraint admits `day` and `week` only, so Month is kept on
     * this device ([ViewKeys.AGENDA_MONTH]) until the column admits it.
     */
    val synced: Boolean get() = this != Month

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

    /**
     * The agenda's last-used period. Default [AgendaViewMode.Day]. Day and
     * Week follow the member's account; Month is this device's ([AgendaViewMode.synced]).
     */
    val agendaMode: Flow<AgendaViewMode>

    suspend fun setAgendaMode(mode: AgendaViewMode)

    /**
     * The agenda's calendar filter (the web sidebar's layers and contexts):
     * [showPartnerEvents], plus the viewer's own calendar and the hidden
     * contexts. Those two stay on this device ([ViewKeys.CALENDAR_OWN_HIDDEN]).
     */
    val calendarFilter: Flow<CalendarFilter>

    /** Hides or shows the viewer's own personal events in the agenda (joint ones always show). */
    suspend fun setOwnCalendarHidden(hidden: Boolean)

    /**
     * Hides or shows one context in the agenda, read and written in one step
     * so quick taps on several never undo each other.
     */
    suspend fun setCalendarCategoryHidden(id: String, hidden: Boolean)

    /** Replaces the contexts hidden from the agenda (category ids; empty shows all). */
    suspend fun setHiddenCalendarCategories(ids: Set<String>)
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
        dataStore.data.map { agendaModeOf(it) }.distinctUntilChanged()

    override val calendarFilter: Flow<CalendarFilter> = dataStore.data.map {
        CalendarFilter(
            showPartner = it[ViewKeys.SHOW_PARTNER_EVENTS] ?: true,
            ownHidden = it[ViewKeys.CALENDAR_OWN_HIDDEN] ?: false,
            hiddenCategoryIds = it[ViewKeys.CALENDAR_HIDDEN_CATEGORIES].orEmpty(),
        )
    }.distinctUntilChanged()

    override suspend fun setShowPartnerEvents(show: Boolean) {
        changes.localChange { dataStore.edit { it[ViewKeys.SHOW_PARTNER_EVENTS] = show } }
        widgets.requestRefresh()
    }

    // Device-only, so straight to the file: there is nothing to upload.
    override suspend fun setOwnCalendarHidden(hidden: Boolean) {
        dataStore.edit { it[ViewKeys.CALENDAR_OWN_HIDDEN] = hidden }
    }

    override suspend fun setCalendarCategoryHidden(id: String, hidden: Boolean) {
        dataStore.edit {
            val current = it[ViewKeys.CALENDAR_HIDDEN_CATEGORIES].orEmpty()
            it[ViewKeys.CALENDAR_HIDDEN_CATEGORIES] = if (hidden) current + id else current - id
        }
    }

    override suspend fun setHiddenCalendarCategories(ids: Set<String>) {
        dataStore.edit { it[ViewKeys.CALENDAR_HIDDEN_CATEGORIES] = ids }
    }

    override suspend fun setAgendaMode(mode: AgendaViewMode) {
        if (!mode.synced) {
            // Nothing the account copy can take: stays on this device, over the synced mode.
            dataStore.edit { it[ViewKeys.AGENDA_MONTH] = true }
            return
        }
        changes.localChange {
            dataStore.edit {
                it[ViewKeys.AGENDA_MODE] = mode.wire
                it.remove(ViewKeys.AGENDA_MONTH)
            }
        }
    }
}

/** The saved agenda mode: this device's Month when picked, else the synced Day / Week. */
internal fun agendaModeOf(prefs: Preferences): AgendaViewMode =
    if (prefs[ViewKeys.AGENDA_MONTH] == true) AgendaViewMode.Month else AgendaViewMode.fromWire(prefs[ViewKeys.AGENDA_MODE])
