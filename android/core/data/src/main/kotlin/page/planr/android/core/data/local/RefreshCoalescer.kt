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
 * [refresh] returns what the block returned (whether the cache changed); a
 * skipped call returns false. Each repository holds its own instance, so keys
 * only need to be unique within it.
 */
class RefreshCoalescer @Inject constructor(
    private val gate: CacheGate,
    private val clock: Clock,
) {
    private val running = HashMap<Any, CompletableDeferred<Boolean>>()
    private val done = HashMap<Any, Done>()

    private class Done(val epoch: Long, val startedAt: Instant)

    /** The leader of a flight was cancelled: its joiners start their own instead. */
    private class LeaderCancelled : Exception()

    suspend fun refresh(key: Any, force: Boolean = false, block: suspend () -> Boolean): Boolean {
        while (true) {
            val epoch = gate.currentEpoch
            val now = clock.now()
            val joined: CompletableDeferred<Boolean>?
            val own = CompletableDeferred<Boolean>()
            synchronized(this) {
                joined = running[key]
                if (joined == null) {
                    if (!force && done[key]?.isFresh(epoch, now) == true) return false
                    running[key] = own
                }
            }
            if (joined != null) {
                try {
                    return joined.await()
                } catch (_: LeaderCancelled) {
                    continue
                }
            }
            return lead(key, own, epoch, now, block)
        }
    }

    private suspend fun lead(
        key: Any,
        flight: CompletableDeferred<Boolean>,
        epoch: Long,
        startedAt: Instant,
        block: suspend () -> Boolean,
    ): Boolean {
        val changed = try {
            block()
        } catch (e: Throwable) {
            synchronized(this) { running.remove(key) }
            flight.completeExceptionally(if (e is CancellationException) LeaderCancelled() else e)
            throw e
        }
        synchronized(this) {
            running.remove(key)
            done.entries.removeAll { !it.value.isFresh(epoch, startedAt) }
            done[key] = Done(epoch, startedAt)
        }
        flight.complete(changed)
        return changed
    }

    private fun Done.isFresh(epoch: Long, now: Instant): Boolean =
        this.epoch == epoch && now - startedAt in Duration.ZERO..<FRESH_FOR

    internal companion object {
        /** How long a finished refresh counts as current. Realtime keeps the cache live in between. */
        val FRESH_FOR = 30.seconds
    }
}
