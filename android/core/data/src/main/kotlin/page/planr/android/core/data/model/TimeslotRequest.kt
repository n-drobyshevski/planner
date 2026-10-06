package page.planr.android.core.data.model

import kotlin.time.Instant

/** `timeslot_requests.status`. */
enum class TimeslotRequestStatus(val wire: String) {
    Pending("pending"),
    Approved("approved"),
    Declined("declined"),
    ;

    companion object {
        /** Anything this build doesn't know reads as [Pending], the column's default. */
        fun fromWire(value: String?): TimeslotRequestStatus = entries.firstOrNull { it.wire == value } ?: Pending
    }
}

/**
 * A time a public share viewer proposed to the share's owner (lib/types.ts
 * `TimeslotRequestRow`). Owner-only under RLS; the owner approves (an event
 * at the proposed time) or declines it from the Inbox.
 */
data class TimeslotRequest(
    val id: String,
    val shareId: String,
    val workspaceId: String,
    val ownerId: String,
    /** the name the requester gave; null = anonymous */
    val requesterName: String?,
    val message: String?,
    val proposedStart: Instant,
    val proposedEnd: Instant,
    val status: TimeslotRequestStatus,
    val createdAt: Instant,
    val resolvedAt: Instant?,
)
