package page.planr.android.core.model

import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * An `event_overrides` row: an EXDATE-style cancel or a per-occurrence edit of
 * a recurring series. Mirrors `OverrideRow` in lib/types.ts.
 *
 * [occurrenceDate] is the ORIGINAL occurrence start — the stable key, unique
 * per (event_id, occurrence_date). Null patch fields inherit from the series.
 */
@Serializable
data class EventOverride(
    val id: String,
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("event_id") val eventId: String,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("occurrence_date") val occurrenceDate: Instant,
    val type: OverrideType,
    val title: String? = null,
    val description: String? = null,
    val location: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("starts_at") val start: Instant? = null,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("ends_at") val end: Instant? = null,
    @SerialName("all_day") val allDay: Boolean? = null,
)
