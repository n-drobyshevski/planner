package page.planr.android.core.data.remote

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import page.planr.android.core.model.PlanrJson

/** Rows exactly as PostgREST returns them (snake_case, `+00:00` offsets, microseconds). */
object Fixtures {
    const val WS = "11111111-1111-1111-1111-111111111111"
    const val MEMBER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    const val EVENT_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
    const val TASK_ID = "tttttttt-tttt-tttt-tttt-tttttttttttt"

    fun row(json: String): JsonObject = PlanrJson.parseToJsonElement(json).jsonObject

    fun eventRow(
        id: String = EVENT_ID,
        start: String = "2026-06-01T09:00:00+00:00",
        end: String = "2026-06-01T10:00:00+00:00",
        rrule: String? = null,
        recurrenceEndsAt: String? = null,
        updatedAt: String = "2026-05-20T08:15:30.123456+00:00",
        taskId: String? = null,
    ) = row(
        """
        {
          "id": "$id",
          "workspace_id": "$WS",
          "owner_id": "$MEMBER_A",
          "category_id": null,
          "title": "Standup",
          "description": null,
          "location": "Kitchen",
          "is_private": false,
          "is_shared": true,
          "hidden_from_public": false,
          "color": null,
          "kind": "event",
          "all_day": false,
          "inactive": false,
          "status": "confirmed",
          "starts_at": "$start",
          "ends_at": "$end",
          "time_zone": "Europe/Berlin",
          "rrule": ${rrule?.let { "\"$it\"" } ?: "null"},
          "recurrence_ends_at": ${recurrenceEndsAt?.let { "\"$it\"" } ?: "null"},
          "task_id": ${taskId?.let { "\"$it\"" } ?: "null"},
          "attributes": {"energy": "high"},
          "created_at": "2026-05-01T10:00:00.5+00:00",
          "updated_at": "$updatedAt"
        }
        """,
    )

    fun taskRow(id: String = TASK_ID, updatedAt: String = "2026-05-20T08:15:30.123456+00:00") = row(
        """
        {
          "id": "$id",
          "workspace_id": "$WS",
          "owner_id": "$MEMBER_A",
          "assignee_id": null,
          "parent_id": null,
          "collection_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
          "category_id": null,
          "title": "Buy paint",
          "description": "Warm white",
          "is_private": false,
          "color": null,
          "board_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          "priority": 2,
          "due_date": "2026-06-03",
          "start_date": null,
          "is_milestone": false,
          "position": 1.5,
          "sequential": false,
          "completed_at": null,
          "attributes": {},
          "created_at": "2026-05-01T10:00:00+00:00",
          "updated_at": "$updatedAt"
        }
        """,
    )
}
