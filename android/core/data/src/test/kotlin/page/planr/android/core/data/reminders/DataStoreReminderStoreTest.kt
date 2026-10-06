package page.planr.android.core.data.reminders

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest

/** The reminder bookkeeping on a real Preferences DataStore file. */
class DataStoreReminderStoreTest {
    private val dir: File = Files.createTempDirectory("planr-reminders").toFile()

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun TestScope.dataStore() =
        PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { File(dir, "reminders_test.preferences_pb") })

    private val alarm = ReminderAlarm(
        id = 42,
        key = "yoga:1791302400000",
        eventId = "yoga",
        occurrenceStart = Instant.parse("2026-10-06T16:00:00Z"),
        triggerAt = Instant.parse("2026-10-06T15:50:00Z"),
        title = "Yoga",
        timeText = "18:00–19:00",
    )

    @Test
    fun `defaults to Off with nothing armed`() = runTest {
        val store = DataStoreReminderStore(dataStore())
        assertEquals(ReminderLead.Off, store.lead.first())
        assertEquals(emptyList(), store.scheduled())
        assertEquals(emptyList(), store.snoozed())
    }

    @Test
    fun `the lead and armed alarms round-trip`() = runTest {
        val store = DataStoreReminderStore(dataStore())
        store.setLead(ReminderLead.Fifteen)
        store.setScheduled(listOf(alarm))
        store.setSnoozed(listOf(alarm.copy(triggerAt = Instant.parse("2026-10-06T16:00:00Z"))))

        assertEquals(ReminderLead.Fifteen, store.lead.first())
        assertEquals(listOf(alarm), store.scheduled())
        assertEquals(Instant.parse("2026-10-06T16:00:00Z"), store.snoozed().single().triggerAt)
    }

    @Test
    fun `sign-out forgets the member's state but keeps the device's lead`() = runTest {
        val data = dataStore()
        val store = DataStoreReminderStore(data)
        store.setLead(ReminderLead.Five)
        store.setScheduled(listOf(alarm))
        store.setSnoozed(listOf(alarm))
        data.edit {
            it[ReminderKeys.sleepCategory("member-a")] = "cat-sleep"
            it[ReminderKeys.sleepCategoryAt("member-a")] = 1L
        }

        store.clearMember()

        assertEquals(ReminderLead.Five, store.lead.first())
        assertEquals(emptyList(), store.scheduled())
        assertEquals(emptyList(), store.snoozed())
        assertEquals(setOf("lead_minutes"), data.data.first().asMap().keys.map { it.name }.toSet())
    }

    @Test
    fun `an unreadable list reads as nothing armed`() = runTest {
        val data = dataStore()
        data.edit { it[ReminderKeys.SCHEDULED] = "not json" }
        assertEquals(emptyList(), DataStoreReminderStore(data).scheduled())
    }
}
