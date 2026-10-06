@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

/** When the channels' joins call for a refetch ([refetchOnJoin]). */
class RefetchOnJoinTest {
    private val main = MutableStateFlow(false)
    private val sync = MutableStateFlow(false)
    private val grace = 5.seconds

    private fun TestScope.refetches(): () -> Int {
        var count = 0
        backgroundScope.launch { refetchOnJoin(main, sync, grace).collect { count++ } }
        runCurrent()
        return { count }
    }

    private fun TestScope.set(flow: MutableStateFlow<Boolean>, joined: Boolean) {
        flow.value = joined
        runCurrent()
    }

    @Test
    fun `the first join refetches once, when both channels are up`() = runTest {
        val count = refetches()

        set(main, true)
        assertEquals(0, count(), "waits for the sync channel: a delete before its join would be missed")
        set(sync, true)

        assertEquals(1, count())
        advanceTimeBy(grace * 2)
        assertEquals(1, count())
    }

    @Test
    fun `the sync channel joining first still refetches once`() = runTest {
        val count = refetches()

        set(sync, true)
        set(main, true)

        assertEquals(1, count())
    }

    @Test
    fun `a sync channel that doesn't join doesn't hold the refetch back`() = runTest {
        val count = refetches()
        set(main, true)

        advanceTimeBy(grace - 1.seconds)
        assertEquals(0, count())
        advanceTimeBy(2.seconds)

        assertEquals(1, count())
    }

    @Test
    fun `a sync channel joining late refetches again`() = runTest {
        val count = refetches()
        set(main, true)
        advanceTimeBy(grace * 2)

        set(sync, true)

        assertEquals(2, count())
    }

    @Test
    fun `a sync rejoin while the main channel stayed up refetches`() = runTest {
        val count = refetches()
        set(main, true)
        set(sync, true)

        set(sync, false)
        set(sync, true)

        assertEquals(2, count())
    }

    @Test
    fun `a socket drop refetches once, whichever channel is back first`() = runTest {
        val count = refetches()
        set(main, true)
        set(sync, true)

        set(sync, false)
        set(main, false)
        set(main, true)
        set(sync, true)
        assertEquals(2, count())

        set(sync, false)
        set(main, false)
        set(sync, true)
        set(main, true)
        assertEquals(3, count())
    }

    @Test
    fun `the main channel dropping cancels the wait`() = runTest {
        val count = refetches()
        set(main, true)
        set(main, false)

        advanceTimeBy(grace * 2)

        assertEquals(0, count())
    }
}
