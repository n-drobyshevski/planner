package page.planr.android.core.insights.model

import page.planr.android.core.model.EventKind
import page.planr.android.core.model.Occurrence

/** One occurrence as analytics sees it (the subset of the web's `Occurrence` it reads). */
data class Span(
    val key: String,
    val eventId: String,
    val title: String,
    val start: Long,
    val end: Long,
    val kind: EventKind,
    val allDay: Boolean,
    val inactive: Boolean,
    val ownerId: String,
    val isShared: Boolean,
    val categoryId: String?,
    val attributes: Attributes,
) {
    companion object {
        /** Converts an expanded occurrence, parsing its attributes once. */
        fun of(o: Occurrence): Span = Span(
            key = o.key,
            eventId = o.eventId,
            title = o.title,
            start = o.start.toEpochMilliseconds(),
            end = o.end.toEpochMilliseconds(),
            kind = o.kind,
            allDay = o.allDay,
            inactive = o.inactive,
            ownerId = o.ownerId,
            isShared = o.isShared,
            categoryId = o.categoryId,
            attributes = Attributes.parse(o.attributes),
        )
    }
}
