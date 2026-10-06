@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

/** When the sync channel's rejoin alone calls for a refetch ([syncRejoinsAlone]). */
class SyncRejoinsAloneTest {
    private val main = MutableStateFlow(false)
    private val sync = MutableStateFlow(false)

    private fun TestScope.refetches(): () -> Int {
        var count = 0
        backgroundScope.launch { syncRejoinsAlone(main, sync).collect { count++ } }
        runCurrent()
        return { count }
    }

    private fun TestScope.set(flow: MutableStateFlow<Boolean>, joined: Boolean) {
        flow.value = joined
        runCurrent()
    }

    @Test
    fun `the first join is covered by the main channel's refetch`() = runTest {
        val count = refetches()

        set(main, true)
        set(sync, true)

        assertEquals(0, count())
    }

    @Test
    fun `a sync rejoin while the main channel stayed up refetches`() = runTest {
        val count = refetches()
        set(main, true)
        set(sync, true)

        set(sync, false)
        set(sync, true)

        assertEquals(1, count())
    }

    @Test
    fun `no extra refetch when the main channel rejoined meanwhile`() = runTest {
        val count = refetches()
        set(main, true)
        set(sync, true)

        // A socket drop: both channels leave and come back, the main one first.
        set(sync, false)
        set(main, false)
        set(main, true)
        set(sync, true)

        assertEquals(0, count())
    }

    @Test
    fun `no refetch while the main channel is still down (its join will)`() = runTest {
        val count = refetches()
        set(main, true)
        set(sync, true)

        set(main, false)
        set(sync, false)
        set(sync, true)

        assertEquals(0, count())
    }

    @Test
    fun `a sync channel that never joined never asks`() = runTest {
        val count = refetches()
        set(main, true)
        set(main, false)
        set(main, true)

        assertEquals(0, count())
    }
}
