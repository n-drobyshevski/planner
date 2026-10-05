package page.planr.android.core.data.local

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** The parts of the cache a snapshot refresh replaces as a whole. */
enum class CacheArea { Events, Tasks, Workspace }

/**
 * Orders every write into the Room cache against the others and against the
 * sign-out wipe. Writers fetch over the network first and only then write,
 * so without this:
 *
 * - a fetch still in flight when the session is cleared would put the
 *   member's rows back on disk after the wipe. Each wipe starts a new
 *   **epoch**; a write begun under an older one is dropped.
 * - a snapshot refresh ([refresh]) fetched before a Realtime change or the
 *   user's own save landed would revert or delete it. Incremental writes
 *   ([change]) bump their area's **change count**; a snapshot whose area
 *   changed while it was being fetched is refetched instead of applied.
 *
 * Blocks run under one [Mutex]: they must only touch Room, never the network
 * or another gate call (the mutex isn't reentrant).
 */
@Singleton
class CacheGate @Inject constructor() {
    private val mutex = Mutex()
    private var epoch = 0L
    private val changes = LongArray(CacheArea.entries.size)

    /** Where a writer started: take it before the network call the write depends on. */
    class Ticket internal constructor(internal val epoch: Long, internal val changes: LongArray)

    suspend fun ticket(): Ticket = mutex.withLock { Ticket(epoch, changes.copyOf()) }

    /**
     * An incremental write (a Realtime row, the result of the user's own
     * save). Returns false, without writing, when the cache was wiped since
     * [ticket].
     */
    suspend fun change(ticket: Ticket, vararg areas: CacheArea, write: suspend () -> Unit): Boolean =
        mutex.withLock {
            if (ticket.epoch != epoch) return false
            write()
            areas.forEach { changes[it.ordinal]++ }
            true
        }

    /**
     * Fetches a snapshot of [area] and writes it as authoritative (rows it
     * lacks are deleted). Refetches when an incremental write to [area]
     * landed during the fetch; after [MAX_ATTEMPTS] it applies the latest
     * snapshot anyway, which is never older than what the cache would keep.
     * Dropped when the cache was wiped meanwhile.
     */
    suspend fun <T> refresh(area: CacheArea, fetch: suspend () -> T, write: suspend (T) -> Unit) {
        repeat(MAX_ATTEMPTS) { attempt ->
            val ticket = ticket()
            val snapshot = fetch()
            val lastAttempt = attempt == MAX_ATTEMPTS - 1
            val done = mutex.withLock {
                when {
                    ticket.epoch != epoch -> true
                    !lastAttempt && ticket.changes[area.ordinal] != changes[area.ordinal] -> false
                    else -> {
                        write(snapshot)
                        true
                    }
                }
            }
            if (done) return
        }
    }

    /** Wipes the cache ([clear]) and invalidates every ticket taken before. */
    suspend fun wipe(clear: suspend () -> Unit) = mutex.withLock {
        epoch++
        clear()
    }

    private companion object {
        const val MAX_ATTEMPTS = 3
    }
}
