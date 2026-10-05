package page.planr.android.core.data.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.model.TaskDraft
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.recurrence.PatchField

class TaskPayloadsTest {

    @Test
    fun `insert row has exactly the columns of taskInputToRow`() {
        val row = TaskPayloads.insertRow(
            TaskDraft(workspaceId = "ws", ownerId = "m", title = "  Buy paint  ", dueDate = LocalDate(2026, 6, 3)),
        )
        assertEquals(
            setOf(
                "workspace_id", "owner_id", "assignee_id", "parent_id", "collection_id", "category_id",
                "title", "description", "is_private", "color", "board_id", "priority", "due_date",
                "start_date", "is_milestone", "position", "sequential", "completed_at", "attributes",
            ),
            row.keys,
        )
        assertEquals(JsonPrimitive("Buy paint"), row["title"]) // zod .trim()
        assertEquals(JsonPrimitive(true), row["is_private"]) // tasks default to private
        assertEquals(JsonPrimitive("2026-06-03"), row["due_date"])
        assertEquals(JsonNull, row["completed_at"])
    }

    @Test
    fun `patch row writes only set fields`() {
        val row = TaskPayloads.patchRow(
            TaskPatch(
                boardId = PatchField.Value("b"),
                completedAt = PatchField.Value(Instant.parse("2026-06-01T12:00:00.250Z")),
                dueDate = PatchField.Value(null),
            ),
        )
        assertEquals(setOf("board_id", "completed_at", "due_date"), row.keys)
        assertEquals(JsonPrimitive("2026-06-01T12:00:00.250Z"), row["completed_at"])
        assertEquals(JsonNull, row["due_date"])
    }

    @Test
    fun `invalid input is rejected before any request`() {
        assertFailsWith<IllegalArgumentException> {
            TaskPayloads.insertRow(TaskDraft(workspaceId = "ws", ownerId = "m", title = "   "))
        }
        assertFailsWith<IllegalArgumentException> {
            TaskPayloads.patchRow(TaskPatch(priority = PatchField.Value(4)))
        }
        assertFailsWith<IllegalArgumentException> {
            TaskPayloads.insertRow(TaskDraft(workspaceId = "ws", ownerId = "m", title = "x".repeat(501)))
        }
    }
}
