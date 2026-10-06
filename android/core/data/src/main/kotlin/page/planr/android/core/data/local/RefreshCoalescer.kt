package page.planr.android.core.data.local

import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred

/**
 * Collapses the snapshot refreshes that pile up on a cold start or a return
 * to the foreground (the Realtime join, the agenda, the task list each ask
 * for the same window, tasks and reference data within a second or two).
 * Per key:
 *
 * - **single flight**: a caller arriving while a refresh of the same key runs
 *   joins it and gets its result (or its failure) instead of fetching again.
 *   Forced calls join too: the [CacheGate] already refetches a snapshot that
 *   a local write overtook, so joining never loses one.
 * - **freshness**: a refresh that succeeded less than [FRESH_FOR] ago (from
 *   its start) is not repeated, unless the caller forces it (pull-to-refresh,
 *   the periodic or user-requested sync). A cache wipe since then (sign-out,
 *   [CacheGate.wipe]) makes it stale at once.
 *
 * Both only count refreshes begun since the last wipe and the last
 * [CacheGate.outdateSnapshots] (the Realtime join): a caller arriving after
 * one waits for an older refresh still running, then fetches anew.
 *
 * [refresh] returns what the block returned (whether the cache changed); a
 * skipped call returns false. Each repository holds its own instance, so keys
 * only need to be unique within it.
 */
class RefreshCoalescer @Inject constructor(
    private val gate: CacheGate,
    private val clock: Clock,
) {
    private val running = HashMap<Any, Flight>()
    private val done = HashMap<Any, Done>()

    /** What a refresh's snapshot can be trusted against: no wipe or outdating since. */
    private data class Stamp(val epoch: Long, val outdated: Long)

    private class Flight(val stamp: Stamp, val result: CompletableDeferred<Boolean>)

    private class Done(val stamp: Stamp, val startedAt: Instant)

    /** The leader of a flight was cancelled: its joiners start their own instead. */
    private class LeaderCancelled : Exception()

    suspend fun refresh(key: Any, force: Boolean = false, block: suspend () -> Boolean): Boolean {
        while (true) {
            val stamp = Stamp(gate.currentEpoch, gate.currentOutdated)
            val now = clock.now()
            val other: Flight?
            val own = Flight(stamp, CompletableDeferred())
            synchronized(this) {
                other = running[key]
                if (other == null) {
                    if (!force && done[key]?.isFresh(stamp, now) == true) return false
                    running[key] = own
                }
            }
            if (other == null) return lead(key, own, now, block)
            if (other.stamp != stamp) {
                // Begun before a wipe or the Realtime join: let it finish
                // (its outcome isn't ours), then fetch a snapshot of our own.
                other.result.join()
                continue
            }
            try {
                return other.result.await()
            } catch (_: LeaderCancelled) {
                continue
            }
        }
    }

    private suspend fun lead(key: Any, flight: Flight, startedAt: Instant, block: suspend () -> Boolean): Boolean {
        val changed = try {
            block()
        } catch (e: Throwable) {
            synchronized(this) { running.remove(key) }
            flight.result.completeExceptionally(if (e is CancellationException) LeaderCancelled() else e)
            throw e
        }
        val current = Stamp(gate.currentEpoch, gate.currentOutdated)
        val now = clock.now()
        synchronized(this) {
            running.remove(key)
            done.entries.removeAll { !it.value.isFresh(current, now) }
            done[key] = Done(flight.stamp, startedAt)
        }
        flight.result.complete(changed)
        return changed
    }

    private fun Done.isFresh(stamp: Stamp, now: Instant): Boolean =
        this.stamp == stamp && now - startedAt in Duration.ZERO..<FRESH_FOR

    internal companion object {
        /** How long a finished refresh counts as current. Realtime keeps the cache live in between. */
        val FRESH_FOR = 30.seconds
    }
}
