package page.planr.android.core.data.model

import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.recurrence.PatchField.Unchanged

/**
 * A partial update of an `events` row: the web's `Partial<EventInput>`. Only
 * fields set to [PatchField.Value] are written (the TS `"key" in patch`
 * checks in `eventPatchToRow`); [Unchanged] leaves the column alone.
 */
data class EventPatch(
    val categoryId: PatchField<String?> = Unchanged,
    val title: PatchField<String> = Unchanged,
    val description: PatchField<String?> = Unchanged,
    val location: PatchField<String?> = Unchanged,
    val isPrivate: PatchField<Boolean> = Unchanged,
    val isShared: PatchField<Boolean> = Unchanged,
    val hiddenFromPublic: PatchField<Boolean> = Unchanged,
    val color: PatchField<String?> = Unchanged,
    val kind: PatchField<EventKind> = Unchanged,
    val allDay: PatchField<Boolean> = Unchanged,
    val inactive: PatchField<Boolean> = Unchanged,
    val status: PatchField<EventStatus> = Unchanged,
    val start: PatchField<Instant> = Unchanged,
    val end: PatchField<Instant> = Unchanged,
    val timeZone: PatchField<String> = Unchanged,
    val rrule: PatchField<String?> = Unchanged,
    val recurrenceEndsAt: PatchField<Instant?> = Unchanged,
    val taskId: PatchField<String?> = Unchanged,
    val attributes: PatchField<JsonObject> = Unchanged,
)
