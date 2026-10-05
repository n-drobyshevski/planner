package page.planr.android.core.data.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput
import page.planr.android.core.recurrence.PatchField

class EventPayloadsTest {

    private val start = Instant.parse("2026-06-01T09:00:00Z")
    private val end = Instant.parse("2026-06-01T10:30:00Z")

    @Test
    fun `insert row has exactly the columns of eventInputToRow`() {
        val row = EventPayloads.insertRow(
            PlannerEventDraft(workspaceId = "ws", ownerId = "m", title = "Swim", start = start, end = end, timeZone = "Europe/Berlin"),
        )
        assertEquals(
            setOf(
                "workspace_id", "owner_id", "category_id", "title", "description", "location",
                "is_private", "is_shared", "hidden_from_public", "color", "kind", "all_day", "inactive",
                "status", "starts_at", "ends_at", "time_zone", "rrule", "recurrence_ends_at", "task_id",
                "attributes",
            ),
            row.keys,
        )
        // Defaults and null handling match `?? null` / `?? false` / `?? "event"`.
        assertEquals(JsonNull, row["category_id"])
        assertEquals(JsonPrimitive(false), row["is_private"])
        assertEquals(JsonPrimitive("event"), row["kind"])
        assertEquals(JsonPrimitive("confirmed"), row["status"])
        assertEquals(JsonObject(emptyMap()), row["attributes"])
        // `new Date(ms).toISOString()`: always millisecond precision.
        assertEquals(JsonPrimitive("2026-06-01T09:00:00.000Z"), row["starts_at"])
        assertEquals(JsonPrimitive("2026-06-01T10:30:00.000Z"), row["ends_at"])
    }

    @Test
    fun `patch row carries only the fields that are set`() {
        val row = EventPayloads.patchRow(
            EventPatch(
                title = PatchField.Value("Run"),
                location = PatchField.Value(null),
                start = PatchField.Value(start),
                recurrenceEndsAt = PatchField.Value(null),
            ),
        )
        assertEquals(setOf("title", "location", "starts_at", "recurrence_ends_at"), row.keys)
        assertEquals(JsonNull, row["location"])
        assertEquals(JsonNull, row["recurrence_ends_at"])
        assertEquals(JsonPrimitive("2026-06-01T09:00:00.000Z"), row["starts_at"])
    }

    @Test
    fun `cancel override row is just the key and type`() {
        val row = EventPayloads.overrideRow("ws", OverrideInput("e1", start, OverrideType.Cancel))
        assertEquals(
            mapOf(
                "workspace_id" to JsonPrimitive("ws"),
                "event_id" to JsonPrimitive("e1"),
                "occurrence_date" to JsonPrimitive("2026-06-01T09:00:00.000Z"),
                "type" to JsonPrimitive("cancel"),
            ),
            row.toMap(),
        )
    }

    @Test
    fun `modify override copies present fields and drops inactive and status`() {
        val patch = OccurrencePatch(
            title = "Late standup",
            description = PatchField.Value(null),
            end = end,
            inactive = true,
            status = EventStatus.Planned,
        )
        val row = EventPayloads.overrideRow("ws", OverrideInput("e1", start, OverrideType.Modify, patch))
        assertEquals(
            setOf("workspace_id", "event_id", "occurrence_date", "type", "title", "description", "ends_at"),
            row.keys,
        )
        assertEquals(JsonPrimitive("modify"), row["type"])
        assertEquals(JsonNull, row["description"])
    }

    @Test
    fun `editAll output maps onto an event patch`() {
        val patch = EventPayloads.fromOccurrencePatch(
            OccurrencePatch(title = "T", categoryId = PatchField.Value("c"), start = start, end = end),
        )
        assertEquals(setOf("title", "category_id", "starts_at", "ends_at"), EventPayloads.patchRow(patch).keys)
    }
}
