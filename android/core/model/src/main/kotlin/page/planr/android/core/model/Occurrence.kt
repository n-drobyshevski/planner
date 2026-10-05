package page.planr.android.core.model

import kotlin.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * A concrete, displayable instance produced by expanding events over a window
 * (`Occurrence` in lib/types.ts). Not a database row.
 *
 * [key] is the stable identity: the event id for a single event, or
 * `"$eventId:$occurrenceDateEpochMs"` for a recurring instance (the web's
 * `${eventId}:${occurrenceDate}`, so keys match across clients).
 */
@Serializable
data class Occurrence(
    val key: String,
    val eventId: String,
    /** ORIGINAL occurrence start: the override key. */
    @Serializable(with = PostgresInstantSerializer::class)
    val occurrenceDate: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    val start: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    val end: Instant,
    val allDay: Boolean,
    val inactive: Boolean,
    val status: EventStatus,
    val title: String,
    val description: String?,
    val location: String?,
    val categoryId: String?,
    val color: String?,
    val kind: EventKind,
    val ownerId: String,
    val isPrivate: Boolean,
    /** Effective jointness: non-private and (is_shared or in a shared category). */
    val isShared: Boolean,
    val hiddenFromPublic: Boolean,
    val taskId: String?,
    val attributes: JsonObject,
    val isRecurring: Boolean,
    /** true when a `modify` override was applied to this instance. */
    val isException: Boolean,
) {
    companion object {
        /** Builds the recurring-instance key, identical to the web's `keyFor`. */
        fun recurringKey(eventId: String, occurrenceDate: Instant): String =
            "$eventId:${occurrenceDate.toEpochMilliseconds()}"
    }
}

/** Half-open time window `[start, end)`. */
@Serializable
data class TimeWindow(
    @Serializable(with = PostgresInstantSerializer::class)
    val start: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    val end: Instant,
) {
    init {
        require(end >= start) { "TimeWindow end ($end) is before start ($start)" }
    }

    /** Half-open overlap test, like the web's `intersects`. */
    fun intersects(start: Instant, end: Instant): Boolean = start < this.end && end > this.start
}
