package page.planr.android.core.data.reminders

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** The `planr_reminders` DataStore: this device's reminder setting and bookkeeping. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ReminderDataStore

/** Keys of the `planr_reminders` DataStore. */
internal object ReminderKeys {
    val LEAD_MINUTES = intPreferencesKey("lead_minutes")
    val SCHEDULED = stringPreferencesKey("scheduled")
    val SNOOZED = stringPreferencesKey("snoozed")

    /** The member's sleep category as last read ("" = none), and when ([CacheReminderSource]). */
    fun sleepCategory(memberId: String) = stringPreferencesKey("sleep_category:$memberId")

    fun sleepCategoryAt(memberId: String) = longPreferencesKey("sleep_category_at:$memberId")

    fun isMemberKey(key: Preferences.Key<*>): Boolean =
        key.name.startsWith("sleep_category:") || key.name.startsWith("sleep_category_at:")
}

@Singleton
class DataStoreReminderStore @Inject constructor(
    @ReminderDataStore private val dataStore: DataStore<Preferences>,
) : ReminderStore {

    override val lead: Flow<ReminderLead> =
        dataStore.data.map { ReminderLead.fromMinutes(it[ReminderKeys.LEAD_MINUTES]) }.distinctUntilChanged()

    override suspend fun setLead(lead: ReminderLead) {
        dataStore.edit { it[ReminderKeys.LEAD_MINUTES] = lead.minutes }
    }

    override suspend fun scheduled(): List<ReminderAlarm> = read(ReminderKeys.SCHEDULED)

    override suspend fun setScheduled(alarms: List<ReminderAlarm>) = write(ReminderKeys.SCHEDULED, alarms)

    override suspend fun snoozed(): List<ReminderAlarm> = read(ReminderKeys.SNOOZED)

    override suspend fun setSnoozed(alarms: List<ReminderAlarm>) = write(ReminderKeys.SNOOZED, alarms)

    override suspend fun clearMember() {
        dataStore.edit { prefs ->
            prefs.remove(ReminderKeys.SCHEDULED)
            prefs.remove(ReminderKeys.SNOOZED)
            prefs.asMap().keys.filter(ReminderKeys::isMemberKey).forEach { prefs.remove(it) }
        }
    }

    private suspend fun read(key: Preferences.Key<String>): List<ReminderAlarm> {
        val json = dataStore.data.first()[key] ?: return emptyList()
        // Unreadable (an older format): treat as nothing armed; the next plan re-arms what is due.
        return runCatching { Json.decodeFromString(STORED, json) }.getOrDefault(emptyList()).map { it.toAlarm() }
    }

    private suspend fun write(key: Preferences.Key<String>, alarms: List<ReminderAlarm>) {
        dataStore.edit { prefs ->
            if (alarms.isEmpty()) prefs.remove(key) else prefs[key] = Json.encodeToString(STORED, alarms.map(::StoredAlarm))
        }
    }

    @Serializable
    private data class StoredAlarm(
        val id: Int,
        val key: String,
        val eventId: String,
        val startMs: Long,
        val triggerMs: Long,
        val title: String,
        val timeText: String,
    ) {
        constructor(alarm: ReminderAlarm) : this(
            id = alarm.id,
            key = alarm.key,
            eventId = alarm.eventId,
            startMs = alarm.occurrenceStart.toEpochMilliseconds(),
            triggerMs = alarm.triggerAt.toEpochMilliseconds(),
            title = alarm.title,
            timeText = alarm.timeText,
        )

        fun toAlarm() = ReminderAlarm(
            id = id,
            key = key,
            eventId = eventId,
            occurrenceStart = Instant.fromEpochMilliseconds(startMs),
            triggerAt = Instant.fromEpochMilliseconds(triggerMs),
            title = title,
            timeText = timeText,
        )
    }

    private companion object {
        val STORED = ListSerializer(StoredAlarm.serializer())
    }
}
