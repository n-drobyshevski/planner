package page.planr.android.core.data.notify

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/** The `planr_notify` DataStore: this device's opt-in notifications and their bookkeeping. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class NotifyDataStore

/**
 * This device's opt-in notifications (Settings → Notifications), both off
 * by default and never synced to the account, plus what they need to
 * remember between runs.
 */
interface NotifyPrefs {
    /** "New time requests": a notification for each request made through a share link. */
    val newRequests: Flow<Boolean>

    /** "Partner's changes": a digest of what the partner changed in the next two days. */
    val partnerChanges: Flow<Boolean>

    /**
     * Turning it on forgets the seen requests, so the first check marks the
     * backlog seen without notifying, and starts the requests it reports from
     * now on ([newRequestsSince]).
     */
    suspend fun setNewRequests(on: Boolean)

    /** Turning it on starts the changes it reports from now on ([partnerChangesSince]). */
    suspend fun setPartnerChanges(on: Boolean)

    /** The pending requests already accounted for; null until the first check since turning it on. */
    suspend fun seenRequests(): Set<String>?

    suspend fun setSeenRequests(ids: Set<String>)

    /**
     * When "New time requests" was turned on; null while off. Requests made
     * before it are never notified, even when the first check primed from a
     * list fetched earlier (offline when it was turned on).
     */
    suspend fun newRequestsSince(): Instant?

    /** When "Partner's changes" was turned on; null while off. Older edits are never reported. */
    suspend fun partnerChangesSince(): Instant?

    /** Sign-out: forget the member's bookkeeping (the switches stay: they are the device's). */
    suspend fun clearMember()
}

internal object NotifyKeys {
    val NEW_REQUESTS = booleanPreferencesKey("new_requests")
    val PARTNER_CHANGES = booleanPreferencesKey("partner_changes")
    val SEEN_REQUESTS = stringSetPreferencesKey("seen_requests")
    val REQUESTS_SINCE = longPreferencesKey("new_requests_since")
    val PARTNER_SINCE = longPreferencesKey("partner_changes_since")
}

@Singleton
class DataStoreNotifyPrefs @Inject constructor(
    @NotifyDataStore private val dataStore: DataStore<Preferences>,
    private val clock: Clock,
) : NotifyPrefs {

    override val newRequests: Flow<Boolean> =
        dataStore.data.map { it[NotifyKeys.NEW_REQUESTS] ?: false }.distinctUntilChanged()

    override val partnerChanges: Flow<Boolean> =
        dataStore.data.map { it[NotifyKeys.PARTNER_CHANGES] ?: false }.distinctUntilChanged()

    override suspend fun setNewRequests(on: Boolean) {
        dataStore.edit { prefs ->
            if (on && prefs[NotifyKeys.NEW_REQUESTS] != true) {
                prefs.remove(NotifyKeys.SEEN_REQUESTS)
                prefs[NotifyKeys.REQUESTS_SINCE] = clock.now().toEpochMilliseconds()
            }
            if (!on) {
                prefs.remove(NotifyKeys.SEEN_REQUESTS)
                prefs.remove(NotifyKeys.REQUESTS_SINCE)
            }
            prefs[NotifyKeys.NEW_REQUESTS] = on
        }
    }

    override suspend fun setPartnerChanges(on: Boolean) {
        dataStore.edit { prefs ->
            if (on && prefs[NotifyKeys.PARTNER_CHANGES] != true) {
                prefs[NotifyKeys.PARTNER_SINCE] = clock.now().toEpochMilliseconds()
            }
            if (!on) prefs.remove(NotifyKeys.PARTNER_SINCE)
            prefs[NotifyKeys.PARTNER_CHANGES] = on
        }
    }

    override suspend fun seenRequests(): Set<String>? = dataStore.data.first()[NotifyKeys.SEEN_REQUESTS]

    override suspend fun setSeenRequests(ids: Set<String>) {
        dataStore.edit { it[NotifyKeys.SEEN_REQUESTS] = ids }
    }

    override suspend fun newRequestsSince(): Instant? {
        val prefs = dataStore.data.first()
        if (prefs[NotifyKeys.NEW_REQUESTS] != true) return null
        return prefs[NotifyKeys.REQUESTS_SINCE]?.let(Instant::fromEpochMilliseconds)
    }

    override suspend fun partnerChangesSince(): Instant? {
        val prefs = dataStore.data.first()
        if (prefs[NotifyKeys.PARTNER_CHANGES] != true) return null
        return prefs[NotifyKeys.PARTNER_SINCE]?.let(Instant::fromEpochMilliseconds)
    }

    override suspend fun clearMember() {
        dataStore.edit { prefs ->
            prefs.remove(NotifyKeys.SEEN_REQUESTS)
            // The next member's requests and changes start from their own sign-in, not the backlog the first sync brings.
            if (prefs[NotifyKeys.NEW_REQUESTS] == true) prefs[NotifyKeys.REQUESTS_SINCE] = clock.now().toEpochMilliseconds()
            if (prefs[NotifyKeys.PARTNER_CHANGES] == true) prefs[NotifyKeys.PARTNER_SINCE] = clock.now().toEpochMilliseconds()
        }
    }
}
