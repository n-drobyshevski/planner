package page.planr.android.core.data.model

import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.recurrence.PatchField.Unchanged

/**
 * A `tasks` insert: the web's `TaskInput` with its defaults (private by
 * default, position 0). Validated like `taskInputSchema` before it is sent.
 */
data class TaskDraft(
    val workspaceId: String,
    val ownerId: String,
    val title: String,
    val assigneeId: String? = null,
    val parentId: String? = null,
    val collectionId: String? = null,
    val categoryId: String? = null,
    val description: String? = null,
    val isPrivate: Boolean = true,
    val color: String? = null,
    val boardId: String? = null,
    /** 0..3, null = none (see TaskPriority). */
    val priority: Int? = null,
    val dueDate: LocalDate? = null,
    val startDate: LocalDate? = null,
    val isMilestone: Boolean = false,
    val position: Double = 0.0,
    val sequential: Boolean = false,
    val completedAt: Instant? = null,
    val attributes: JsonObject = JsonObject(emptyMap()),
)

/**
 * A partial `tasks` update (`Partial<TaskInput>` minus workspace/owner, as in
 * `taskPatchSchema`). Only [PatchField.Value] fields are written.
 */
data class TaskPatch(
    val assigneeId: PatchField<String?> = Unchanged,
    val parentId: PatchField<String?> = Unchanged,
    val collectionId: PatchField<String?> = Unchanged,
    val categoryId: PatchField<String?> = Unchanged,
    val title: PatchField<String> = Unchanged,
    val description: PatchField<String?> = Unchanged,
    val isPrivate: PatchField<Boolean> = Unchanged,
    val color: PatchField<String?> = Unchanged,
    val boardId: PatchField<String?> = Unchanged,
    val priority: PatchField<Int?> = Unchanged,
    val dueDate: PatchField<LocalDate?> = Unchanged,
    val startDate: PatchField<LocalDate?> = Unchanged,
    val isMilestone: PatchField<Boolean> = Unchanged,
    val position: PatchField<Double> = Unchanged,
    val sequential: PatchField<Boolean> = Unchanged,
    val completedAt: PatchField<Instant?> = Unchanged,
    val attributes: PatchField<JsonObject> = Unchanged,
)
