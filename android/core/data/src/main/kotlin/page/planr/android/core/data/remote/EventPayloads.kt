package page.planr.android.core.data.remote

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput
import page.planr.android.core.recurrence.PatchField

/**
 * Domain -> snake_case row payloads for `events` and `event_overrides`, the
 * Kotlin twins of `eventInputToRow` / `eventPatchToRow` (lib/supabase/mappers.ts)
 * and the row built in `applyOverride` (mutations.ts). Same keys, same
 * null-vs-absent rules, same ISO timestamp form.
 */
internal object EventPayloads {

    /** `eventInputToRow`: every insertable column, defaults filled in. */
    fun insertRow(draft: PlannerEventDraft): JsonObject = buildJsonObject {
        put("workspace_id", draft.workspaceId)
        put("owner_id", draft.ownerId)
        put("category_id", draft.categoryId)
        put("title", draft.title)
        put("description", draft.description)
        put("location", draft.location)
        put("is_private", draft.isPrivate)
        put("is_shared", draft.isShared)
        put("hidden_from_public", draft.hiddenFromPublic)
        put("color", draft.color)
        put("kind", draft.kind.wire)
        put("all_day", draft.allDay)
        put("inactive", draft.inactive)
        put("status", draft.status.wire)
        put("starts_at", PostgresTime.toIso(draft.start))
        put("ends_at", PostgresTime.toIso(draft.end))
        put("time_zone", draft.timeZone)
        put("rrule", draft.rrule)
        put("recurrence_ends_at", draft.recurrenceEndsAt?.let(PostgresTime::toIso))
        put("task_id", draft.taskId)
        put("attributes", draft.attributes)
    }

    /** `eventPatchToRow`: only the fields the patch carries. */
    fun patchRow(patch: EventPatch): JsonObject = buildJsonObject {
        patch.categoryId.ifSet { put("category_id", it) }
        patch.title.ifSet { put("title", it) }
        patch.description.ifSet { put("description", it) }
        patch.location.ifSet { put("location", it) }
        patch.isPrivate.ifSet { put("is_private", it) }
        patch.isShared.ifSet { put("is_shared", it) }
        patch.hiddenFromPublic.ifSet { put("hidden_from_public", it) }
        patch.color.ifSet { put("color", it) }
        patch.kind.ifSet { put("kind", it.wire) }
        patch.allDay.ifSet { put("all_day", it) }
        patch.inactive.ifSet { put("inactive", it) }
        patch.status.ifSet { put("status", it.wire) }
        patch.start.ifSet { put("starts_at", PostgresTime.toIso(it)) }
        patch.end.ifSet { put("ends_at", PostgresTime.toIso(it)) }
        patch.timeZone.ifSet { put("time_zone", it) }
        patch.rrule.ifSet { put("rrule", it) }
        patch.recurrenceEndsAt.ifSet { put("recurrence_ends_at", it?.let(PostgresTime::toIso)) }
        patch.taskId.ifSet { put("task_id", it) }
        patch.attributes.ifSet { put("attributes", it) }
    }

    /**
     * The `event_overrides` upsert row from `applyOverride`. A `modify` copies
     * only the patch fields present; `inactive` / `status` have no override
     * column and are deliberately dropped, exactly like the web.
     */
    fun overrideRow(workspaceId: String, input: OverrideInput): JsonObject = buildJsonObject {
        put("workspace_id", workspaceId)
        put("event_id", input.eventId)
        put("occurrence_date", PostgresTime.toIso(input.occurrenceDate))
        put("type", input.type.wire)
        val p = input.patch
        if (input.type == OverrideType.Modify && p != null) {
            p.title?.let { put("title", it) }
            p.description.ifSet { put("description", it) }
            p.location.ifSet { put("location", it) }
            p.categoryId.ifSet { put("category_id", it) }
            p.start?.let { put("starts_at", PostgresTime.toIso(it)) }
            p.end?.let { put("ends_at", PostgresTime.toIso(it)) }
            p.allDay?.let { put("all_day", it) }
        }
    }

    /**
     * The master-row patch for "all events": [OccurrencePatch] as returned by
     * `EditSemantics.editAll` (null = absent for the non-nullable fields).
     */
    fun fromOccurrencePatch(patch: OccurrencePatch): EventPatch = EventPatch(
        title = patch.title.toField(),
        description = patch.description,
        location = patch.location,
        categoryId = patch.categoryId,
        allDay = patch.allDay.toField(),
        inactive = patch.inactive.toField(),
        status = patch.status.toField(),
        start = patch.start.toField(),
        end = patch.end.toField(),
    )
}

internal inline fun <T> PatchField<T>.ifSet(block: (T) -> Unit) {
    if (this is PatchField.Value) block(value)
}

internal fun <T : Any> T?.toField(): PatchField<T> =
    if (this == null) PatchField.Unchanged else PatchField.Value(this)

internal val EventKind.wire: String
    get() = when (this) {
        EventKind.Event -> "event"
        EventKind.Context -> "context"
    }

internal val EventStatus.wire: String
    get() = when (this) {
        EventStatus.Cancelled -> "cancelled"
        EventStatus.Planned -> "planned"
        EventStatus.Confirmed -> "confirmed"
    }

internal val OverrideType.wire: String
    get() = when (this) {
        OverrideType.Cancel -> "cancel"
        OverrideType.Modify -> "modify"
    }
