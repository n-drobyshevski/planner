package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlin.time.Instant
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.model.Task

/** Task writes from lib/supabase/mutations.ts (`createTask`, `updateTask`, `deleteTask`). */
class TaskMutations @Inject constructor(
    private val gateway: PostgrestGateway,
) {

    suspend fun createTask(draft: TaskDraft): Task =
        gateway.insert(SupabaseTables.TASKS, listOf(TaskPayloads.insertRow(draft)))
            .single()
            .decodeAs(Task.serializer())

    /**
     * `updateTask`; with [expectedUpdatedAt] a concurrent edit elsewhere makes
     * it throw [StaleWriteException] instead of overwriting.
     */
    suspend fun updateTask(id: String, patch: TaskPatch, expectedUpdatedAt: Instant? = null): Task {
        val filters = buildList {
            add(eq("id", id))
            if (expectedUpdatedAt != null) addAll(updatedAtGuard(expectedUpdatedAt))
        }
        val rows = gateway.update(SupabaseTables.TASKS, TaskPayloads.patchRow(patch), filters)
        val row = rows.firstOrNull() ?: throw StaleWriteException(SupabaseTables.TASKS, id)
        return row.decodeAs(Task.serializer())
    }

    /** Deletes the task; the DB cascades its subtasks and linked calendar blocks. */
    suspend fun deleteTask(id: String) {
        gateway.delete(SupabaseTables.TASKS, listOf(eq("id", id)))
    }
}
