package page.planr.android.feature.agenda.edit

import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.attributes.AttributesMerge
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.PatchField.Unchanged
import page.planr.android.core.recurrence.PatchField.Value
import page.planr.android.core.recurrence.RRuleBuild
import page.planr.android.core.recurrence.RecurrenceEnd
import page.planr.android.core.recurrence.RecurrenceForm

/**
 * The stored sharing flags for a form. An event filed under a SHARED context
 * is joint through the context, so the per-event flags are stored clean and
 * the visibility control is hidden (`deriveSharing` in event-dialog.tsx).
 */
data class Sharing(val sharedContext: Boolean, val isPrivate: Boolean, val isShared: Boolean)

fun sharingOf(form: EventForm, categories: List<Category>): Sharing {
    val sharedContext = form.categoryId?.let { id -> categories.firstOrNull { it.id == id } }?.isShared == true
    return Sharing(
        sharedContext = sharedContext,
        isPrivate = !sharedContext && form.visibility == VisibilityChoice.Private,
        isShared = !sharedContext && form.visibility == VisibilityChoice.Shared,
    )
}

/**
 * Form → write payloads, mirroring the save paths of the web's event dialog.
 * Pure; the ViewModel decides which one to send.
 */
object EventWrites {

    /** A new event owned by [ownerId] (create mode). */
    fun draft(form: EventForm, workspaceId: String, ownerId: String, categories: List<Category>): PlannerEventDraft {
        val sharing = sharingOf(form, categories)
        return PlannerEventDraft(
            workspaceId = workspaceId,
            ownerId = ownerId,
            categoryId = form.categoryId,
            title = form.title.trim(),
            description = form.description.trim().ifEmpty { null },
            location = form.location.trim().ifEmpty { null },
            isPrivate = sharing.isPrivate,
            isShared = sharing.isShared,
            hiddenFromPublic = form.hiddenFromPublic,
            kind = EventKind.Event,
            allDay = form.allDay,
            inactive = form.inactive,
            status = form.status,
            start = form.start,
            end = form.end,
            timeZone = form.timeZone,
            rrule = RRuleBuild.buildRRule(form.recurrence),
            recurrenceEndsAt = recurrenceEndsAt(form.recurrence),
            attributes = AttributesMerge.apply(JsonObject(emptyMap()), form.attributes),
        )
    }

    /**
     * A non-recurring event (which may gain a recurrence): the whole row. The
     * rule and zone are only written when they changed from [initial], so an
     * untouched rule the editor can't express survives the save; likewise
     * the stored [attributes] only take the edited keys.
     */
    fun singlePatch(form: EventForm, initial: EventForm, categories: List<Category>, attributes: JsonObject): EventPatch =
        rowPatch(form, initial, categories, attributes, start = form.start, end = form.end)

    /**
     * "All events": the master row. The series moves by how far this
     * occurrence moved, and takes the occurrence's new duration.
     */
    fun seriesPatch(
        form: EventForm,
        initial: EventForm,
        event: PlannerEvent,
        occurrence: Occurrence,
        categories: List<Category>,
    ): EventPatch {
        val start = event.start + (form.start - occurrence.start)
        return rowPatch(form, initial, categories, event.attributes, start = start, end = start + (form.end - form.start))
    }

    /**
     * "This event" / "This and following": the per-occurrence fields
     * (`OccurrencePatch`). Visibility, zone and recurrence are series-level
     * and stay as they are, as on the web.
     */
    fun occurrencePatch(form: EventForm): OccurrencePatch = OccurrencePatch(
        title = form.title.trim(),
        description = Value(form.description.trim().ifEmpty { null }),
        location = Value(form.location.trim().ifEmpty { null }),
        categoryId = Value(form.categoryId),
        start = form.start,
        end = form.end,
        allDay = form.allDay,
        inactive = form.inactive,
        status = form.status,
    )

    /**
     * The stored [attributes] with the keys edited between [initial] and
     * [form] applied (icalUid and unknown keys kept), or null when none
     * changed. Attributes are series-level, so a "this event" save writes
     * them to the master and a split hands them to the new series.
     */
    fun mergedAttributes(form: EventForm, initial: EventForm, attributes: JsonObject): JsonObject? {
        val edits = AttributesMerge.edits(initial.attributes, form.attributes)
        return if (edits.isEmpty()) null else AttributesMerge.merge(attributes, edits)
    }

    /** `recurrence_ends_at`: the UNTIL bound, or null (open-ended / COUNT). */
    fun recurrenceEndsAt(recurrence: RecurrenceForm?): Instant? = (recurrence?.end as? RecurrenceEnd.Until)?.date

    private fun rowPatch(
        form: EventForm,
        initial: EventForm,
        categories: List<Category>,
        attributes: JsonObject,
        start: Instant,
        end: Instant,
    ): EventPatch {
        val sharing = sharingOf(form, categories)
        val recurrenceChanged = form.recurrence != initial.recurrence
        val merged = mergedAttributes(form, initial, attributes)
        return EventPatch(
            categoryId = Value(form.categoryId),
            title = Value(form.title.trim()),
            description = Value(form.description.trim().ifEmpty { null }),
            location = Value(form.location.trim().ifEmpty { null }),
            isPrivate = Value(sharing.isPrivate),
            isShared = Value(sharing.isShared),
            hiddenFromPublic = Value(form.hiddenFromPublic),
            allDay = Value(form.allDay),
            inactive = Value(form.inactive),
            status = Value(form.status),
            start = Value(start),
            end = Value(end),
            timeZone = if (form.timeZone != initial.timeZone) Value(form.timeZone) else Unchanged,
            rrule = if (recurrenceChanged) Value(RRuleBuild.buildRRule(form.recurrence)) else Unchanged,
            recurrenceEndsAt = if (recurrenceChanged) Value(recurrenceEndsAt(form.recurrence)) else Unchanged,
            attributes = if (merged != null) Value(merged) else Unchanged,
        )
    }
}

