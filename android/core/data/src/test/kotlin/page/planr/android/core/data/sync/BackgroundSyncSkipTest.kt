package page.planr.android.core.data.sync

import androidx.lifecycle.Lifecycle
import androidx.work.Data
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** When [SyncWorker] has something to do ([backgroundSyncNeeded]). */
class BackgroundSyncSkipTest {

    @Test
    fun `skipped while the app is on screen with Realtime joined`() {
        assertFalse(backgroundSyncNeeded(Lifecycle.State.STARTED, subscribed = true))
        assertFalse(backgroundSyncNeeded(Lifecycle.State.RESUMED, subscribed = true))
    }

    @Test
    fun `runs in the foreground while Realtime is down`() {
        assertTrue(backgroundSyncNeeded(Lifecycle.State.RESUMED, subscribed = false))
    }

    @Test
    fun `runs in the background, even while the channel lingers`() {
        for (state in listOf(Lifecycle.State.INITIALIZED, Lifecycle.State.CREATED, Lifecycle.State.DESTROYED)) {
            assertTrue(backgroundSyncNeeded(state, subscribed = true), "$state")
            assertTrue(backgroundSyncNeeded(state, subscribed = false), "$state")
        }
    }

    @Test
    fun `a requested sync runs even on screen with Realtime joined`() {
        for (state in Lifecycle.State.entries) {
            assertTrue(backgroundSyncNeeded(state, subscribed = true, requested = true), "$state")
        }
    }

    @Test
    fun `the sync-now request is marked requested, a request without input is not`() {
        val input = SyncScheduler.syncNowRequest().workSpec.input
        assertTrue(input.getBoolean(SyncScheduler.KEY_REQUESTED, false))
        assertFalse(Data.EMPTY.getBoolean(SyncScheduler.KEY_REQUESTED, false))
    }
}
