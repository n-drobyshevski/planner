package page.planr.android.feature.tasks.detail

import javax.inject.Inject
import javax.inject.Singleton
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
 * kept, until a screen claims it, so it shows once.
 */
@Singleton
class TaskDeletions @Inject constructor() {
    private val _pending = MutableStateFlow<TaskDeleted?>(null)

    /** The latest delete no screen has shown yet. */
    val pending: StateFlow<TaskDeleted?> = _pending.asStateFlow()

    fun post(deleted: TaskDeleted) {
        _pending.value = deleted
    }

    /**
     * Deletes for a screen to show, each claimed as it is collected. The
     * detail that made the delete passes its own task as [except], so the
     * closing screen leaves it to the one underneath.
     */
    fun claims(except: String? = null): Flow<TaskDeleted> =
        pending.filterNotNull().filter { it.taskId != except && _pending.compareAndSet(it, null) }
}
