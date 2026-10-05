package page.planr.android.feature.agenda.model

import kotlin.time.Duration.Companion.days
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.RecurrenceExpander

/**
 * The occurrence [ref] points at, expanded from [event] and its [overrides]
 * exactly as the agenda draws it (so a modified instance shows its edits).
 * A ref without an occurrence date addresses a single event, or the first
 * instance of a series. Null when that instance was cancelled or never existed.
 */
fun findOccurrence(
    event: PlannerEvent,
    overrides: List<EventOverride>,
    ref: EventRef,
    expander: RecurrenceExpander,
    sharedCategoryIds: Set<String>,
): Occurrence? {
    val anchor = ref.occurrenceDate ?: event.start
    // Wide enough to catch an instance a "this event" edit moved weeks away.
    val window = TimeWindow(anchor - LOOKUP_PAD, maxOf(anchor, event.end) + LOOKUP_PAD)
    val occurrences = expander.expandEvent(event, overrides, window, sharedCategoryIds)
    return if (!event.isRecurring) {
        occurrences.firstOrNull()
    } else {
        occurrences.firstOrNull { it.occurrenceDate == anchor }
    }
}

private val LOOKUP_PAD = 32.days
