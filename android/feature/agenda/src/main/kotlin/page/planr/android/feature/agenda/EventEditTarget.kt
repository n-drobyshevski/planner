package page.planr.android.feature.agenda

import kotlin.time.Instant

/** What the event editor opens on. */
sealed interface EventEditTarget {
    /** A new event, starting at [start] (or the next half hour). */
    data class New(val start: Instant? = null) : EventEditTarget

    /** An existing event or occurrence: an event id or an occurrence key. */
    data class Existing(val ref: String) : EventEditTarget
}
