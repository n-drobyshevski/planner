package page.planr.android.core.data.remote

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.data.model.TaskPatch

/**
 * Domain -> snake_case row payloads for `tasks`: `taskInputToRow` /
 * `taskPatchToRow` (lib/supabase/mappers.ts), after the same checks
 * `taskInputSchema` / `taskPatchSchema` (lib/tasks/schemas.ts) run on the web —
 * including trimming the title.
 */
internal object TaskPayloads {

    fun insertRow(draft: TaskDraft): JsonObject {
        val title = TaskRules.title(draft.title)
        TaskRules.check(draft.description, draft.priority, draft.color, draft.position)
        return buildJsonObject {
            put("workspace_id", draft.workspaceId)
            put("owner_id", draft.ownerId)
            put("assignee_id", draft.assigneeId)
            put("parent_id", draft.parentId)
            put("collection_id", draft.collectionId)
            put("category_id", draft.categoryId)
            put("title", title)
            put("description", draft.description)
            put("is_private", draft.isPrivate)
            put("color", draft.color)
            put("board_id", draft.boardId)
            put("priority", draft.priority)
            put("due_date", draft.dueDate?.toString())
            put("start_date", draft.startDate?.toString())
            put("is_milestone", draft.isMilestone)
            put("position", draft.position)
            put("sequential", draft.sequential)
            put("completed_at", draft.completedAt?.let(PostgresTime::toIso))
            put("attributes", draft.attributes)
        }
    }

    fun patchRow(patch: TaskPatch): JsonObject {
        TaskRules.check(
            description = (patch.description as? ValueOf<String?>)?.value,
            priority = (patch.priority as? ValueOf<Int?>)?.value,
            color = (patch.color as? ValueOf<String?>)?.value,
            position = (patch.position as? ValueOf<Double>)?.value,
        )
        return buildJsonObject {
            patch.assigneeId.ifSet { put("assignee_id", it) }
            patch.parentId.ifSet { put("parent_id", it) }
            patch.collectionId.ifSet { put("collection_id", it) }
            patch.categoryId.ifSet { put("category_id", it) }
            patch.title.ifSet { put("title", TaskRules.title(it)) }
            patch.description.ifSet { put("description", it) }
            patch.isPrivate.ifSet { put("is_private", it) }
            patch.color.ifSet { put("color", it) }
            patch.boardId.ifSet { put("board_id", it) }
            patch.priority.ifSet { put("priority", it) }
            patch.dueDate.ifSet { put("due_date", it?.toString()) }
            patch.startDate.ifSet { put("start_date", it?.toString()) }
            patch.isMilestone.ifSet { put("is_milestone", it) }
            patch.position.ifSet { put("position", it) }
            patch.sequential.ifSet { put("sequential", it) }
            patch.completedAt.ifSet { put("completed_at", it?.let(PostgresTime::toIso)) }
            patch.attributes.ifSet { put("attributes", it) }
        }
    }
}

private typealias ValueOf<T> = page.planr.android.core.recurrence.PatchField.Value<T>

/** The field rules of `taskInputBase` in lib/tasks/schemas.ts. */
internal object TaskRules {
    private const val TITLE_MAX = 500
    private const val DESCRIPTION_MAX = 10_000

    /** Trimmed, 1..500 chars (zod `.trim().min(1).max(500)`). */
    fun title(raw: String): String {
        val title = raw.trim()
        require(title.isNotEmpty()) { "Please add a title." }
        require(title.length <= TITLE_MAX) { "Keep the title under 500 characters." }
        return title
    }

    fun check(description: String?, priority: Int?, color: String?, position: Double?) {
        require(description == null || description.length <= DESCRIPTION_MAX) {
            "Keep the description under 10,000 characters."
        }
        require(priority == null || priority in 0..3) { "Priority must be 0..3." }
        require(color == null || color.isNotEmpty()) { "Color must not be empty." }
        require(position == null || position.isFinite()) { "Position must be finite." }
    }
}
