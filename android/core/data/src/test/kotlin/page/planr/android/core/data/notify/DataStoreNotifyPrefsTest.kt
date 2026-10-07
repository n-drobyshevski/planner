package page.planr.android.core.data.notify

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest

/** The opt-in notifications' switches and bookkeeping on a real Preferences DataStore file. */
class DataStoreNotifyPrefsTest {
    private val dir: File = Files.createTempDirectory("planr-notify").toFile()
    private var now = Instant.parse("2026-10-07T09:00:00Z")
    private val clock = object : Clock {
        override fun now(): Instant = now
    }

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun TestScope.prefs() = DataStoreNotifyPrefs(
        PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { File(dir, "notify_test.preferences_pb") }),
        clock,
    )

    @Test
    fun `both are off by default, with nothing seen and no start`() = runTest {
        val prefs = prefs()
        assertFalse(prefs.newRequests.first())
        assertFalse(prefs.partnerChanges.first())
        assertNull(prefs.seenRequests())
        assertNull(prefs.partnerChangesSince())
        assertNull(prefs.newRequestsSince())
    }

    @Test
    fun `turning new requests on again starts unprimed, so the backlog is marked seen without notifying`() = runTest {
        val prefs = prefs()
        prefs.setNewRequests(true)
        val on = now
        prefs.setSeenRequests(setOf("r1"))
        now = Instant.parse("2026-10-07T10:00:00Z")
        prefs.setNewRequests(true) // already on: kept
        assertEquals(setOf("r1"), prefs.seenRequests())
        assertEquals(on, prefs.newRequestsSince(), "turning it on again keeps the start")

        prefs.setNewRequests(false)
        assertNull(prefs.seenRequests())
        assertNull(prefs.newRequestsSince())
        prefs.setNewRequests(true)
        assertTrue(prefs.newRequests.first())
        assertNull(prefs.seenRequests())
        assertEquals(now, prefs.newRequestsSince())
    }

    @Test
    fun `partner changes count from when they were turned on`() = runTest {
        val prefs = prefs()
        prefs.setPartnerChanges(true)
        val on = now
        now = Instant.parse("2026-10-07T10:00:00Z")
        prefs.setPartnerChanges(true)
        assertEquals(on, prefs.partnerChangesSince(), "turning it on again keeps the start")

        prefs.setPartnerChanges(false)
        assertNull(prefs.partnerChangesSince())
    }

    @Test
    fun `sign-out forgets the member's bookkeeping but keeps the switches`() = runTest {
        val prefs = prefs()
        prefs.setNewRequests(true)
        prefs.setPartnerChanges(true)
        prefs.setSeenRequests(setOf("r1"))
        now = Instant.parse("2026-10-08T09:00:00Z")

        prefs.clearMember()

        assertTrue(prefs.newRequests.first())
        assertTrue(prefs.partnerChanges.first())
        assertNull(prefs.seenRequests())
        assertEquals(now, prefs.partnerChangesSince(), "the next member's changes start now")
        assertEquals(now, prefs.newRequestsSince(), "and their requests")
    }
}
