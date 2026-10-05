package page.planr.android.feature.agenda.model

import kotlin.time.Instant
import page.planr.android.core.model.Occurrence

/**
 * What a detail / edit route points at. The route argument is either an event
 * id or an occurrence key (`eventId:epochMs`, see [Occurrence.recurringKey]),
 * so one string addresses a single event and one instance of a series alike.
 */
data class EventRef(val eventId: String, val occurrenceDate: Instant? = null) {

    /** The route argument for this ref. */
    val key: String
        get() = occurrenceDate?.let { Occurrence.recurringKey(eventId, it) } ?: eventId

    companion object {
        fun parse(value: String): EventRef {
            val sep = value.lastIndexOf(':')
            val ms = if (sep > 0) value.substring(sep + 1).toLongOrNull() else null
            return if (ms == null) EventRef(value) else EventRef(value.substring(0, sep), Instant.fromEpochMilliseconds(ms))
        }
    }
}
