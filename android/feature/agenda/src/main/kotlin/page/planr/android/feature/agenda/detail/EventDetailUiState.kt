package page.planr.android.feature.agenda.detail

import kotlinx.datetime.TimeZone
import page.planr.android.core.model.Category
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.recurrence.RecurrenceForm
import page.planr.android.feature.agenda.model.AgendaBlock

/** The event detail screen's state. */
sealed interface EventDetailUiState {
    data object Loading : EventDetailUiState

    /** Deleted, cancelled, or not visible to this member. */
    data object Missing : EventDetailUiState

    data class Ready(val detail: EventDetail) : EventDetailUiState
}

/** Everything the detail card shows (the web's `EventDetails` props). */
data class EventDetail(
    val event: PlannerEvent,
    val occurrence: Occurrence,
    /** Resolved color + ownership, as the agenda draws it. */
    val block: AgendaBlock,
    val ownerName: String?,
    val ownerColor: String?,
    val isOwn: Boolean,
    val category: Category?,
    /** Parsed rule for the "Repeats …" line; null for a single event. */
    val recurrence: RecurrenceForm?,
    val zone: TimeZone,
) {
    val canEdit: Boolean get() = block.ownership.canEdit
}
