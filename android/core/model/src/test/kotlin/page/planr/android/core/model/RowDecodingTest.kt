package page.planr.android.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class RowDecodingTest {

    @Test
    fun `decodes a PostgREST events row`() {
        val json = """
            {
              "id": "e1", "workspace_id": "w1", "owner_id": "m1", "category_id": null,
              "title": "Standup", "description": null, "location": null,
              "is_private": false, "is_shared": true, "hidden_from_public": false,
              "color": null, "kind": "event", "all_day": false, "inactive": false,
              "status": "planned",
              "starts_at": "2026-03-27T08:00:00+00:00", "ends_at": "2026-03-27T08:30:00+00:00",
              "time_zone": "Europe/Berlin", "rrule": "FREQ=DAILY", "recurrence_ends_at": null,
              "task_id": null, "attributes": {"energy": 2},
              "created_at": "2026-03-01T10:00:00.123456+00:00",
              "updated_at": "2026-03-01T10:00:00.123456+00:00",
              "some_future_column": 42
            }
        """.trimIndent()

        val event = PlanrJson.decodeFromString<PlannerEvent>(json)

        assertEquals(Instant.parse("2026-03-27T08:00:00Z"), event.start)
        assertEquals(EventStatus.Planned, event.status)
        assertEquals(EventVisibility.Shared, event.visibility())
        assertEquals("2", event.attributes["energy"]?.jsonPrimitive?.content)
        assertNull(event.recurrenceEndsAt)
    }

    @Test
    fun `accepts Postgres text timestamps from Realtime payloads`() {
        assertEquals(
            Instant.parse("2026-06-01T07:00:00Z"),
            PostgresInstantSerializer.parse("2026-06-01 09:00:00+02"),
        )
    }

    @Test
    fun `unknown enum values fall back to the default`() {
        val json = """{"id":"m1","workspace_id":"w1","name":"A","color":"#c0492a","context_label":"floating"}"""
        assertEquals(ContextLabel.Bar, PlanrJson.decodeFromString<Member>(json).contextLabel)
    }

    @Test
    fun `task due dates are zone-free and status derives from completed_at`() {
        val json = """
            {"id":"t1","workspace_id":"w1","owner_id":"m1","title":"Pay rent",
             "priority":3,"due_date":"2026-07-01","completed_at":"2026-06-30T18:00:00+00:00",
             "created_at":"2026-06-01T00:00:00+00:00","updated_at":"2026-06-30T18:00:00+00:00"}
        """.trimIndent()

        val task = PlanrJson.decodeFromString<Task>(json)

        assertEquals(LocalDate(2026, 7, 1), task.dueDate)
        assertEquals(TaskStatus.Done, task.status)
        assertEquals(TaskPriority.High, task.priorityLevel)
    }

    @Test
    fun `event drafts encode snake_case columns and ISO instants`() {
        val draft = PlannerEventDraft(
            workspaceId = "w1",
            ownerId = "m1",
            title = "Dinner",
            start = Instant.parse("2026-06-01T17:00:00Z"),
            end = Instant.parse("2026-06-01T18:30:00Z"),
            timeZone = "Europe/Moscow",
        )

        val row = PlanrJson.parseToJsonElement(PlanrJson.encodeToString(draft)).jsonObject

        assertEquals("2026-06-01T17:00:00Z", row["starts_at"]?.jsonPrimitive?.content)
        assertEquals("confirmed", row["status"]?.jsonPrimitive?.content)
        assertEquals(null, row["id"])
    }

    @Test
    fun `recurring keys match the web format`() {
        val at = Instant.fromEpochMilliseconds(1_774_598_400_000)
        assertEquals("e1:1774598400000", Occurrence.recurringKey("e1", at))
    }
}
