package page.planr.android.feature.tasks.detail

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull

/** A task deleted from its detail, with the Undo that puts it back. */
class TaskDeleted(val taskId: String, val undo: suspend () -> Unit)

/**
 * Hands a delete's "Task deleted · Undo" from the detail, which closes, to the
 * screen it returns to (the list, or the parent's detail). Only the latest is
 * kept, until a screen claims it, so it shows once. One left unclaimed for
 * longer than [EXPIRY] is dropped rather than surfacing later out of context.
 */
@Singleton
class TaskDeletions @Inject constructor(private val clock: Clock) {
    private val _pending = MutableStateFlow<TaskDeleted?>(null)

    /** The current [pending] and when it was posted, written together. */
    @Volatile private var posted: Pair<TaskDeleted, Instant>? = null

    /** The latest delete no screen has shown yet. */
    val pending: StateFlow<TaskDeleted?> = _pending.asStateFlow()

    fun post(deleted: TaskDeleted) {
        posted = deleted to clock.now()
        _pending.value = deleted
    }

    /**
     * Deletes for a screen to show, each claimed as it is collected. The
     * detail that made the delete passes its own task as [except], so the
     * closing screen leaves it to the one underneath. An expired one is
     * cleared instead of shown.
     */
    fun claims(except: String? = null): Flow<TaskDeleted> =
        pending.filterNotNull().filter {
            if (isExpired(it)) {
                _pending.compareAndSet(it, null)
                false
            } else {
                it.taskId != except && _pending.compareAndSet(it, null)
            }
        }

    /** Timed by [deleted]'s own post, never a newer one's. */
    private fun isExpired(deleted: TaskDeleted): Boolean {
        val (current, at) = posted ?: return false
        return current === deleted && clock.now() - at > EXPIRY
    }

    companion object {
        /** How long an unclaimed delete may wait for a screen to show it. */
        val EXPIRY: Duration = 30.seconds
    }
}
