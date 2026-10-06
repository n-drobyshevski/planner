package page.planr.android.core.data.prefs

import androidx.datastore.core.DataMigration
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

    /** The agenda's last-used period, following the member's account. Default [AgendaViewMode.Day]. */
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
        dataStore.data.map { AgendaViewMode.fromWire(it[ViewKeys.AGENDA_MODE]) }.distinctUntilChanged()

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
        changes.localChange { dataStore.edit { it[ViewKeys.AGENDA_MODE] = mode.wire } }
    }
}

/**
 * Folds the device-only Month of older versions ([ViewKeys.LEGACY_AGENDA_MONTH],
 * kept while `member_app_prefs.agenda_mode` only took `day` / `week`) into
 * [ViewKeys.AGENDA_MODE], once, before anything reads the store. It was this
 * device's latest pick (another device's Day / Week cleared it), so it is
 * marked pending ([ViewKeys.SYNC_PENDING]): the next pull uploads it rather
 * than letting the account's older period overwrite it.
 */
internal object LegacyAgendaMonthMigration : DataMigration<Preferences> {
    override suspend fun shouldMigrate(currentData: Preferences): Boolean =
        ViewKeys.LEGACY_AGENDA_MONTH in currentData

    override suspend fun migrate(currentData: Preferences): Preferences =
        currentData.toMutablePreferences().apply {
            val month = get(ViewKeys.LEGACY_AGENDA_MONTH) == true
            remove(ViewKeys.LEGACY_AGENDA_MONTH)
            if (month) {
                set(ViewKeys.AGENDA_MODE, AgendaViewMode.Month.wire)
                set(ViewKeys.SYNC_PENDING, (get(ViewKeys.SYNC_PENDING) ?: 0L) + 1)
            }
        }.toPreferences()

    override suspend fun cleanUp() = Unit
}
