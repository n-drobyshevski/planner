package page.planr.android.feature.agenda.model

import kotlin.time.Instant
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence

/**
 * Whose an occurrence is, from the viewer's side — what the event block's
 * fill encodes (DESIGN.md §5): mine and shared are solid, theirs is outlined.
 */
enum class Ownership {
    Mine,

    /** Joint (`is_shared` or a shared context): both members can edit. */
    Shared,

    /** The partner's own event: look, don't touch. */
    Theirs,
    ;

    val canEdit: Boolean get() = this != Theirs
}

/** One occurrence as the agenda draws it. */
data class AgendaBlock(
    /** Occurrence key; also the detail route argument (see [EventRef]). */
    val key: String,
    val eventId: String,
    val title: String,
    val start: Instant,
    val end: Instant,
    val allDay: Boolean,
    /** Resolved display hex: per-item color, else context, else the owner's color. */
    val color: String,
    val ownership: Ownership,
    val status: EventStatus,
    val inactive: Boolean,
    val kind: EventKind,
    val isRecurring: Boolean,
    val isPrivate: Boolean,
    /** The context's name and color, shown as a quiet hint under the title. */
    val categoryName: String?,
    val categoryColor: String?,
)

/** Fallback when neither the item, its context nor its owner has a color (warm stone). */
const val FALLBACK_BLOCK_COLOR = "#57534e"

/**
 * The block for [occurrence]. Color resolution mirrors `resolveOccurrenceColor`
 * in lib/calendar/colors.ts; ownership mirrors `canEdit` in lib/scope/visibility.ts.
 */
fun agendaBlockOf(
    occurrence: Occurrence,
    viewerId: String?,
    members: Map<String, Member>,
    categories: Map<String, Category>,
): AgendaBlock {
    val category = occurrence.categoryId?.let(categories::get)
    val ownership = when {
        occurrence.isShared -> Ownership.Shared
        occurrence.ownerId == viewerId -> Ownership.Mine
        else -> Ownership.Theirs
    }
    return AgendaBlock(
        key = occurrence.key,
        eventId = occurrence.eventId,
        title = occurrence.title,
        start = occurrence.start,
        end = occurrence.end,
        allDay = occurrence.allDay,
        color = occurrence.color ?: category?.color ?: members[occurrence.ownerId]?.color ?: FALLBACK_BLOCK_COLOR,
        ownership = ownership,
        status = occurrence.status,
        inactive = occurrence.inactive,
        kind = occurrence.kind,
        isRecurring = occurrence.isRecurring,
        isPrivate = occurrence.isPrivate,
        categoryName = category?.name,
        categoryColor = category?.color,
    )
}
