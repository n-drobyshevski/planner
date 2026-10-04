package page.planr.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * An event's lifecycle state (Postgres enum `event_status`), driving how it
 * renders: cancelled (stripes + strikethrough), planned (dotted outline), or
 * confirmed (plain fill, the default). Series-level; overrides can't change it.
 */
@Serializable
enum class EventStatus {
    @SerialName("cancelled") Cancelled,
    @SerialName("planned") Planned,
    @SerialName("confirmed") Confirmed,
}

/**
 * Postgres enum `event_kind`: a normal calendar event, or a "context" — a
 * category's time-block painted as a backdrop on the calendar.
 */
@Serializable
enum class EventKind {
    @SerialName("event") Event,
    @SerialName("context") Context,
}

/** Postgres enum `override_type`: drop one occurrence, or patch its fields. */
@Serializable
enum class OverrideType {
    @SerialName("cancel") Cancel,
    @SerialName("modify") Modify,
}

/**
 * Who can see / edit an event, derived from `is_private` + `is_shared` (+ the
 * category's ownership). The original `event_scope` / `event_visibility` enums
 * were dropped in 20260604000000_calendar_sharing.sql; this is the derived view.
 */
enum class EventVisibility {
    /** Owner-only (`is_private = true`). */
    Private,

    /** The default: owner's event, visible (read-only) to the partner. */
    Personal,

    /** Joint: both members see and edit it (is_shared, or filed under a shared category). */
    Shared,
}
