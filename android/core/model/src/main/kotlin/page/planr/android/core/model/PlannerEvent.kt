package page.planr.android.core.model

import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * An `events` row — a single event or the master of a recurring series. Mirrors
 * `EventRow` in lib/types.ts (named PlannerEvent to stay clear of Android's
 * many `Event` types).
 *
 * [start]/[end] are the master / first-occurrence instants; [timeZone] is the
 * IANA zone recurrence expands in (DST-correct). All-day events are anchored to
 * UTC midnight. [rrule] is an RFC 5545 RRULE without a DTSTART line.
 */
@Serializable
data class PlannerEvent(
    val id: String,
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("owner_id") val ownerId: String,
    @SerialName("category_id") val categoryId: String? = null,
    val title: String,
    val description: String? = null,
    val location: String? = null,
    /** true = only the owner can see it. */
    @SerialName("is_private") val isPrivate: Boolean = false,
    /** Per-event joint flag; effective jointness also includes shared categories. */
    @SerialName("is_shared") val isShared: Boolean = false,
    /** Withheld from public share links regardless of [isPrivate]. */
    @SerialName("hidden_from_public") val hiddenFromPublic: Boolean = false,
    /** Per-item color override (hex); null = derive from category/owner. */
    val color: String? = null,
    val kind: EventKind = EventKind.Event,
    @SerialName("all_day") val allDay: Boolean = false,
    /** De-emphasized (grayed out) on the calendar, e.g. sleep hours. */
    val inactive: Boolean = false,
    val status: EventStatus = EventStatus.Confirmed,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("starts_at") val start: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("ends_at") val end: Instant,
    @SerialName("time_zone") val timeZone: String,
    val rrule: String? = null,
    /** Denormalized last-occurrence bound for window pruning; null = open-ended. */
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("recurrence_ends_at") val recurrenceEndsAt: Instant? = null,
    /** When set, this event is a scheduled block ("part") of a task. */
    @SerialName("task_id") val taskId: String? = null,
    /** Optimization attributes (energy/flexibility/...), an opaque jsonb bag. */
    val attributes: JsonObject = JsonObject(emptyMap()),
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("created_at") val createdAt: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("updated_at") val updatedAt: Instant,
) {
    val isRecurring: Boolean get() = rrule != null

    /** Derived visibility (see [EventVisibility]); pass the shared category ids. */
    fun visibility(sharedCategoryIds: Set<String> = emptySet()): EventVisibility = when {
        isPrivate -> EventVisibility.Private
        isShared || (categoryId != null && categoryId in sharedCategoryIds) -> EventVisibility.Shared
        else -> EventVisibility.Personal
    }

    /** The insertable columns of this row (id and timestamps are DB-assigned). */
    fun toDraft(): PlannerEventDraft = PlannerEventDraft(
        workspaceId = workspaceId,
        ownerId = ownerId,
        categoryId = categoryId,
        title = title,
        description = description,
        location = location,
        isPrivate = isPrivate,
        isShared = isShared,
        hiddenFromPublic = hiddenFromPublic,
        color = color,
        kind = kind,
        allDay = allDay,
        inactive = inactive,
        status = status,
        start = start,
        end = end,
        timeZone = timeZone,
        rrule = rrule,
        recurrenceEndsAt = recurrenceEndsAt,
        taskId = taskId,
        attributes = attributes,
    )
}

/**
 * An `events` insert payload: [PlannerEvent] minus `id` / `created_at` /
 * `updated_at` (the web's `Omit<EventRow, "id" | "createdAt" | "updatedAt">`).
 * Produced by "this and following" splits and by new-event forms.
 */
@Serializable
data class PlannerEventDraft(
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("owner_id") val ownerId: String,
    @SerialName("category_id") val categoryId: String? = null,
    val title: String,
    val description: String? = null,
    val location: String? = null,
    @SerialName("is_private") val isPrivate: Boolean = false,
    @SerialName("is_shared") val isShared: Boolean = false,
    @SerialName("hidden_from_public") val hiddenFromPublic: Boolean = false,
    val color: String? = null,
    val kind: EventKind = EventKind.Event,
    @SerialName("all_day") val allDay: Boolean = false,
    val inactive: Boolean = false,
    val status: EventStatus = EventStatus.Confirmed,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("starts_at") val start: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("ends_at") val end: Instant,
    @SerialName("time_zone") val timeZone: String,
    val rrule: String? = null,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("recurrence_ends_at") val recurrenceEndsAt: Instant? = null,
    @SerialName("task_id") val taskId: String? = null,
    val attributes: JsonObject = JsonObject(emptyMap()),
)
