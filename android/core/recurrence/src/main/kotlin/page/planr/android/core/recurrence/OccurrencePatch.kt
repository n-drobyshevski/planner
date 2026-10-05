package page.planr.android.core.recurrence

import kotlin.time.Instant
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.OverrideType

/**
 * A change to one nullable field, distinguishing "leave it" from "set it to
 * null" — the TypeScript `undefined` vs `null` distinction.
 */
sealed interface PatchField<out T> {
    data object Unchanged : PatchField<Nothing>

    data class Value<out T>(val value: T) : PatchField<T>
}

/**
 * Fields that may be patched on a single occurrence, or (for
 * [EditSemantics.editAll]) on the series master. `OccurrencePatch` in
 * lib/recurrence/edit-semantics.ts.
 *
 * Non-nullable columns use `null` for "unchanged"; the nullable ones
 * (description, location, category) use [PatchField] so they can be cleared.
 */
data class OccurrencePatch(
    val title: String? = null,
    val description: PatchField<String?> = PatchField.Unchanged,
    val location: PatchField<String?> = PatchField.Unchanged,
    val categoryId: PatchField<String?> = PatchField.Unchanged,
    val start: Instant? = null,
    val end: Instant? = null,
    val allDay: Boolean? = null,
    val inactive: Boolean? = null,
    val status: EventStatus? = null,
)

/**
 * An override row to upsert for one occurrence (`OverrideInput`).
 * [occurrenceDate] is the ORIGINAL occurrence start, the stable key.
 */
data class OverrideInput(
    val eventId: String,
    val occurrenceDate: Instant,
    val type: OverrideType,
    val patch: OccurrencePatch? = null,
)
