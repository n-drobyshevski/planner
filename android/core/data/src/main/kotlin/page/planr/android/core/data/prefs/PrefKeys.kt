package page.planr.android.core.data.prefs

import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey

/** Keys of the `planr_view` DataStore ([ViewPreferences], plus [AppPrefsSync]'s bookkeeping). */
internal object ViewKeys {
    val SHOW_PARTNER_EVENTS = booleanPreferencesKey("show_partner_events")
    val AGENDA_MODE = stringPreferencesKey("agenda_mode")

    /**
     * The wake date (yyyy-MM-dd) the morning sleep check-in was dismissed on,
     * per member. Device-only: [AppPrefsSync] never uploads it.
     */
    fun sleepCheckinDismissed(memberId: String) = stringPreferencesKey("sleep_checkin_dismissed:$memberId")

    /**
     * Bumped on every local settings change, removed once an upload of that
     * change (or a later one) succeeded: while it's set, the account copy is
     * behind and must not overwrite the device.
     */
    val SYNC_PENDING = longPreferencesKey("app_prefs_pending")
}

/** Keys of the `planr_insights` DataStore ([InsightsPreferences]), per viewer. */
internal object InsightsKeys {
    fun hidden(viewerId: String) = stringSetPreferencesKey("hidden_categories:$viewerId")

    fun includeInactive(viewerId: String) = booleanPreferencesKey("include_inactive:$viewerId")
}
