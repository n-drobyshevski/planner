package page.planr.android.core.data.inbox

import java.util.UUID
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.attributes.AttributeKey
import page.planr.android.core.data.attributes.AttributesMerge
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.Task
import page.planr.android.core.model.TimeWindow

/** "attention" sorts above "info" (lib/inbox/derive.ts `severity`). */
enum class InboxSeverity { Attention, Info }

/**
 * One Inbox row (lib/inbox/derive.ts `InboxItem`). Language-free: rows carry
 * raw entity text and dates, and the screen builds the visible frame.
 */
sealed interface InboxItem {
    /** Stable across recomputes: `"$kind:$entityKey"`, as on the web. */
    val id: String
    val severity: InboxSeverity

    /** The instant the row is anchored to; newest first within a severity. */
    val sortAt: Instant

    /** The viewer's own finished, unrated, non-recurring calendar block. */
    data class RateEvent(
        override val id: String,
        override val sortAt: Instant,
        val eventId: String,
        val title: String,
        /**
         * The event's attribute bag as derived. The rating merges into the
         * bag stored when it is written, guarded by `updated_at`, not this copy.
         */
        val attributes: JsonObject,
    ) : InboxItem {
        override val severity: InboxSeverity get() = InboxSeverity.Info
    }

    /** A top-level task the viewer finished, still unrated. */
    data class RateTask(
        override val id: String,
        override val sortAt: Instant,
        val taskId: String,
        val title: String,
        val attributes: JsonObject,
    ) : InboxItem {
        override val severity: InboxSeverity get() = InboxSeverity.Info
    }

    /** A recent morning (the wake [date]) without a rated sleep log. */
    data class LogSleep(
        override val id: String,
        override val sortAt: Instant,
        val date: LocalDate,
    ) : InboxItem {
        override val severity: InboxSeverity get() = InboxSeverity.Info
    }

    /** A pending public-share timeslot request: approve (an event) or decline. */
    data class Request(
        override val id: String,
        override val sortAt: Instant,
        val requestId: String,
        val requesterName: String?,
        val message: String?,
        val proposedStart: Instant,
        val proposedEnd: Instant,
    ) : InboxItem {
        override val severity: InboxSeverity get() = InboxSeverity.Attention
    }
}

/** The member's night window (`member_sleep_prefs`), in local hours. */
data class NightWindow(val startHour: Int, val endHour: Int) {
    companion object {
        /** The DB defaults, for when the prefs haven't loaded (use-inbox.ts `DEFAULT_NIGHT`). */
        val DEFAULT = NightWindow(startHour = 20, endHour = 12)
    }
}

/** What the Inbox is derived from (lib/inbox/derive.ts `InboxInput`). */
data class InboxInput(
    /** Occurrences over [InboxRules.occurrenceWindow]: both members'; only the viewer's count. */
    val occurrences: List<Occurrence>,
    /** Workspace tasks, top-level and subtasks. */
    val tasks: List<Task>,
    /** Wake dates the viewer already rated ([page.planr.android.core.data.model.SleepLog.isRated]). */
    val sleepLogDates: Set<LocalDate>,
    /** Pending timeslot requests addressed to the viewer (RLS scopes them to the owner). */
    val requests: List<TimeslotRequest> = emptyList(),
    val viewerId: String,
    val now: Instant,
    val zone: TimeZone,
    /** Keeps today's sleep row hidden until the morning is over. */
    val nightWindow: NightWindow,
    val rateWindowDays: Int = InboxRules.RATE_N,
    val sleepWindowDays: Int = InboxRules.SLEEP_N,
)

/**
 * The Inbox's "needs your attention" rows, derived from data the app already
 * holds (lib/inbox/derive.ts `deriveInboxItems`): recently finished events
 * and tasks without a satisfaction rating, recent mornings without a rated
 * sleep log, and pending timeslot requests. Pure: callers pass `now`.
 */
object InboxRules {
    /** Ratings stay fresh: only the last few days, so the inbox never becomes a backlog. */
    const val RATE_N = 3

    /** Sleep backfill tolerates a week. */
    const val SLEEP_N = 7

    /** Soft cap so a long-neglected workspace can't list without bound. */
    const val INBOX_CAP = 50

    /**
     * The occurrences [derive] reads: [RATE_N] days back plus a day's buffer
     * for the half-open boundary, through the end of today (use-inbox.ts `win`).
     */
    fun occurrenceWindow(now: Instant, zone: TimeZone): TimeWindow {
        val today = now.toLocalDateTime(zone).date
        return TimeWindow(
            start = today.minus(RATE_N + 1, DateTimeUnit.DAY).atStartOfDayIn(zone),
            end = today.plus(1, DateTimeUnit.DAY).atStartOfDayIn(zone),
        )
    }

    /** Sorted attention-first, then newest; capped at [INBOX_CAP]. */
    fun derive(input: InboxInput): List<InboxItem> {
        val now = input.now
        val rateCutoff = now - input.rateWindowDays.days
        val items = mutableListOf<InboxItem>()

        for (r in input.requests) {
            items += InboxItem.Request(
                id = "request:${r.id}",
                sortAt = r.createdAt,
                requestId = r.id,
                requesterName = r.requesterName,
                message = r.message,
                proposedStart = r.proposedStart,
                proposedEnd = r.proposedEnd,
            )
        }

        for (o in input.occurrences) {
            if (o.ownerId != input.viewerId) continue
            if (!o.isRatable()) continue
            // A rating would write the SERIES master row, rating every instance:
            // recurring blocks are skipped until an override write path exists.
            if (o.isRecurring) continue
            if (o.attributes.hasSatisfaction()) continue
            if (!(o.end < now && o.end >= rateCutoff)) continue
            items += InboxItem.RateEvent(
                id = "rate-event:${o.key}",
                sortAt = o.end,
                eventId = o.eventId,
                title = o.title,
                attributes = o.attributes,
            )
        }

        for (task in input.tasks) {
            if (task.parentId != null) continue // subtasks never count
            val completedAt = task.completedAt ?: continue
            if (!(completedAt < now && completedAt >= rateCutoff)) continue
            if (task.attributes.hasSatisfaction()) continue
            // The person who did it rates it; the owner when unassigned.
            val doneByViewer = task.assigneeId == input.viewerId ||
                (task.assigneeId == null && task.ownerId == input.viewerId)
            if (!doneByViewer) continue
            items += InboxItem.RateTask(
                id = "rate-task:${task.id}",
                sortAt = completedAt,
                taskId = task.id,
                title = task.title,
                attributes = task.attributes,
            )
        }

        // Today included, once its wake window has ended: before then the night isn't over.
        val today = now.toLocalDateTime(input.zone).date
        for (back in 0 until input.sleepWindowDays) {
            val date = today.minus(back, DateTimeUnit.DAY)
            if (date in input.sleepLogDates) continue
            if (date == today) {
                val wakeEnd = LocalDateTime(date, LocalTime(input.nightWindow.endHour.coerceIn(0, 23), 0)).toInstant(input.zone)
                if (now < wakeEnd) continue
            }
            items += InboxItem.LogSleep(id = "log-sleep:$date", sortAt = date.atStartOfDayIn(input.zone), date = date)
        }

        return items
            .sortedWith(compareBy<InboxItem> { it.severity.ordinal }.thenByDescending { it.sortAt })
            .take(INBOX_CAP)
    }

    /** The satisfaction options the rating rows offer, "1".."4" (`ATTRIBUTE_META` satisfaction). */
    val satisfactionOptions: List<String> get() = AttributeKey.Satisfaction.options

    /**
     * [attributes] with satisfaction set to [option], every other key (known
     * or not) kept: what a rating row writes (inbox-shell.tsx `setAttribute`).
     */
    fun rated(attributes: JsonObject, option: String): JsonObject =
        AttributesMerge.merge(attributes, mapOf(AttributeKey.Satisfaction to option))

    /**
     * The event approving [request] creates (inbox-shell.tsx `onApprove`):
     * owned by the approving member at the proposed time, titled with the
     * requester's name ([defaultTitle] when anonymous), the message as its
     * description.
     */
    fun approvedEvent(
        request: InboxItem.Request,
        workspaceId: String,
        ownerId: String,
        defaultTitle: String,
        zone: TimeZone,
    ): PlannerEventDraft = PlannerEventDraft(
        workspaceId = workspaceId,
        ownerId = ownerId,
        title = request.requesterName?.trim()?.takeIf { it.isNotEmpty() } ?: defaultTitle,
        description = request.message,
        start = request.proposedStart,
        end = request.proposedEnd,
        timeZone = zone.id,
    )

    /**
     * The id of the event approving [requestId] creates: the same for every
     * attempt, on any device or run of the app, so a retry after a lost
     * answer, a closed screen or a killed process finds the event the first
     * attempt made instead of creating a second one. A name-based UUID.
     */
    fun approvedEventId(requestId: String): String =
        UUID.nameUUIDFromBytes("planr:timeslot-request:$requestId".toByteArray(Charsets.UTF_8)).toString()

    /**
     * A timed, active, non-context block that can carry a rating: sleep and
     * inactive blocks, all-day spans, cancelled ones and context paint never are.
     */
    private fun Occurrence.isRatable(): Boolean =
        kind == EventKind.Event && !inactive && !allDay && status != EventStatus.Cancelled

    /** Set as the web reads it (`parseAttributes`): a junk value counts as unset. */
    private fun JsonObject.hasSatisfaction(): Boolean =
        AttributesMerge.known(this)[AttributeKey.Satisfaction] != null
}
