package page.planr.android.core.data.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest

/** A burst of Realtime messages reaches a slow collector whole ([keepingEvery]). */
class RealtimeBufferTest {

    /**
     * What supabase-kt's `broadcastFlow` / `postgresChangeFlow` do: a
     * `callbackFlow` whose socket callback `trySend`s each message and ignores
     * a failure. Here the whole burst lands at once, as one commit's deletes do.
     */
    private fun burst(size: Int): Flow<Int> = callbackFlow {
        repeat(size) { trySend(it) }
        awaitClose()
    }

    @Test
    fun `a burst past the default buffer reaches a slow collector whole`() = runTest {
        val seen = mutableListOf<Int>()
        burst(BURST).keepingEvery().take(BURST).collect {
            seen += it
            delay(10) // the cache's lock and a Room transaction per message
        }

        assertEquals((0 until BURST).toList(), seen)
    }

    @Test
    fun `without it the same burst loses messages`() = runTest {
        val seen = mutableListOf<Int>()
        val job = launch {
            burst(BURST).collect {
                seen += it
                delay(10) // the cache's lock and a Room transaction per message
            }
        }
        delay(BURST * 100L)
        job.cancel()

        assertTrue(seen.size < BURST, "the default buffer kept ${seen.size} of $BURST")
    }

    private companion object {
        const val BURST = 500
    }
}
