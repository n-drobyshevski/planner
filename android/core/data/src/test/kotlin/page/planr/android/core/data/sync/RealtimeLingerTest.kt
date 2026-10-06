@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

/** Which workspace's Realtime channel is open ([channelWorkspace]), with the background linger. */
class RealtimeLingerTest {
    private val foreground = MutableStateFlow(true)
    private val workspace = MutableStateFlow<String?>(WS)
    private val linger = 60.seconds

    private fun TestScope.collect(): List<String?> {
        val seen = mutableListOf<String?>()
        backgroundScope.launch { channelWorkspace(foreground, workspace, linger).toList(seen) }
        runCurrent()
        return seen
    }

    @Test
    fun `a quick trip to the background keeps the channel (no rejoin)`() = runTest {
        val seen = collect()
        assertEquals(listOf<String?>(WS), seen)

        foreground.value = false
        runCurrent()
        advanceTimeBy(linger - 1.seconds)
        foreground.value = true
        runCurrent()
        advanceTimeBy(linger * 2)

        assertEquals(listOf<String?>(WS), seen, "never closed, so never rejoined")
    }

    @Test
    fun `the channel closes once the app has been in the background for the linger`() = runTest {
        val seen = collect()

        foreground.value = false
        runCurrent()
        advanceTimeBy(linger - 1.seconds)
        runCurrent()
        assertEquals(listOf<String?>(WS), seen)

        advanceTimeBy(1.seconds)
        runCurrent()
        assertEquals(listOf(WS, null), seen)

        foreground.value = true
        runCurrent()
        assertEquals(listOf(WS, null, WS), seen, "back later: joins again at once")
    }

    @Test
    fun `each return restarts the linger`() = runTest {
        val seen = collect()

        foreground.value = false
        runCurrent()
        advanceTimeBy(40.seconds)
        foreground.value = true
        runCurrent()
        foreground.value = false
        runCurrent()
        advanceTimeBy(40.seconds)
        runCurrent()
        assertEquals(listOf<String?>(WS), seen)

        advanceTimeBy(20.seconds)
        runCurrent()
        assertEquals(listOf(WS, null), seen)
    }

    @Test
    fun `signing out closes the channel at once, even in the background`() = runTest {
        val seen = collect()

        foreground.value = false
        runCurrent()
        workspace.value = null
        runCurrent()

        assertEquals(listOf(WS, null), seen)
    }

    @Test
    fun `nothing opens while the app starts in the background`() = runTest {
        foreground.value = false
        val seen = collect()
        advanceTimeBy(linger * 2)
        runCurrent()

        assertEquals(listOf<String?>(null), seen)
    }

    private companion object {
        const val WS = "11111111-1111-1111-1111-111111111111"
    }
}
