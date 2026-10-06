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

    /** When the current [pending] was posted. */
    @Volatile private var postedAt: Instant? = null

    /** The latest delete no screen has shown yet. */
    val pending: StateFlow<TaskDeleted?> = _pending.asStateFlow()

    fun post(deleted: TaskDeleted) {
        postedAt = clock.now()
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
            if (isExpired()) {
                _pending.compareAndSet(it, null)
                false
            } else {
                it.taskId != except && _pending.compareAndSet(it, null)
            }
        }

    private fun isExpired(): Boolean {
        val at = postedAt ?: return false
        return clock.now() - at > EXPIRY
    }

    companion object {
        /** How long an unclaimed delete may wait for a screen to show it. */
        val EXPIRY: Duration = 30.seconds
    }
}
