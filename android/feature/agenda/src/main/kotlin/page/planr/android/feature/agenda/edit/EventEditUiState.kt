package page.planr.android.feature.agenda.edit

import page.planr.android.core.model.Category

/** The event editor's screen state. */
data class EventEditUiState(
    val phase: Phase = Phase.Loading,
    val isNew: Boolean = true,
    val form: EventForm? = null,
    /** Contexts the viewer may file under: shared ones and their own. */
    val categories: List<Category> = emptyList(),
    /** Editing one instance of a series: saving asks this / following / all. */
    val isRecurringEdit: Boolean = false,
    val askScope: Boolean = false,
    val saving: Boolean = false,
    /** Shown once a save was attempted with invalid input. */
    val error: EventFormError? = null,
) {
    enum class Phase { Loading, Missing, Ready }

    /** The selected context is shared, so sharing comes from it (no visibility control). */
    val sharedContext: Boolean get() = form?.let { sharingOf(it, categories).sharedContext } == true
}

/** One-shot outcomes the editor screen reacts to. */
sealed interface EventEditEffect {
    /** Saved; leave the editor. */
    data object Done : EventEditEffect

    /** Someone changed the event meanwhile; offer to reload it. */
    data object Stale : EventEditEffect

    /** The write failed (e.g. offline); the form is kept. */
    data object Failed : EventEditEffect
}
