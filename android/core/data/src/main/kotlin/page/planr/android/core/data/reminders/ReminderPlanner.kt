package page.planr.android.core.data.reminders

import java.util.Locale
import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.data.health.SleepBlockPlanner
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/** How long before a timed event its reminder shows; a per-device setting. [Off] is the default. */
enum class ReminderLead(val minutes: Int) {
    Off(0),
    Five(5),
    Ten(10),
    Fifteen(15),
    Thirty(30),
    ;

    val duration: Duration get() = minutes.minutes

    companion object {
        /** Anything unknown (or missing) reads as [Off]. */
        fun fromMinutes(minutes: Int?): ReminderLead = entries.firstOrNull { it != Off && it.minutes == minutes } ?: Off
    }
}

/**
 * One reminder to show at [triggerAt] for the occurrence [key] of [eventId]
 * starting at [occurrenceStart]. [id] is its alarm request code and
 * notification id: stable for the same event and start, so a re-plan
 * replaces an alarm instead of adding a second one.
 */
data class ReminderAlarm(
    val id: Int,
    /** The occurrence key, as the event detail route takes it. */
    val key: String,
    val eventId: String,
    val occurrenceStart: Instant,
    val triggerAt: Instant,
    val title: String,
    /** "10:30–11:15" in the viewer's zone. */
    val timeText: String,
)

/**
 * Which occurrences get a reminder, and when. Pure, so it is unit-tested
 * directly; [ReminderScheduler] turns its output into alarms.
 *
 * Reminded: the viewer's own timed events and the joint ones, starting
 * within [HORIZON]. Not reminded: all-day events, contexts (backdrop bands),
 * cancelled events, the viewer's sleep ([SleepBlockPlanner.isViewerSleep]),
 * other inactive blocks of theirs when no sleep category is set (the same
 * inactive ≡ sleep heuristic), and the partner's personal events.
 */
object ReminderPlanner {
    /** How far ahead reminders are armed; every sync and change re-plans. */
    val HORIZON: Duration = 24.hours

    /** The occurrences [plan] needs: those starting up to [HORIZON] after [now]. */
    fun window(now: Instant): TimeWindow = TimeWindow(now, now + HORIZON)

    /**
     * Reminders for [occurrences] [lead] before each start, sorted by
     * trigger. A trigger already at or before [now] is skipped (the event
     * is about to start or has started). [zone] is the viewer's, for the
     * time text; [formatTime] renders one time of day.
     */
    fun plan(
        occurrences: List<Occurrence>,
        now: Instant,
        lead: Duration,
        zone: TimeZone,
        viewerId: String,
        sleepCategoryId: String?,
        formatTime: (LocalTime) -> String = ::defaultTime,
    ): List<ReminderAlarm> {
        if (!lead.isPositive()) return emptyList()
        val horizon = now + HORIZON
        return occurrences
            .asSequence()
            .filter { it.start > now && it.start <= horizon }
            .filter { isRemindable(it, viewerId, sleepCategoryId) }
            .map { alarmFor(it, lead, zone, formatTime) }
            .filter { it.triggerAt > now }
            .distinctBy { it.id }
            .sortedWith(compareBy<ReminderAlarm> { it.triggerAt }.thenBy { it.key })
            .toList()
    }

    /** Whether [occurrence] is one the viewer wants to be reminded of (see the class doc). */
    fun isRemindable(occurrence: Occurrence, viewerId: String, sleepCategoryId: String?): Boolean =
        !occurrence.allDay &&
            occurrence.kind == EventKind.Event &&
            occurrence.status != EventStatus.Cancelled &&
            (occurrence.ownerId == viewerId || occurrence.isShared) &&
            !SleepBlockPlanner.isViewerSleep(occurrence, viewerId, sleepCategoryId) &&
            !(occurrence.inactive && sleepCategoryId == null)

    /** The reminder for [occurrence], [lead] before its start (whether or not that is still ahead). */
    fun alarmFor(
        occurrence: Occurrence,
        lead: Duration,
        zone: TimeZone,
        formatTime: (LocalTime) -> String = ::defaultTime,
    ): ReminderAlarm = ReminderAlarm(
        id = requestCode(occurrence.eventId, occurrence.start),
        key = occurrence.key,
        eventId = occurrence.eventId,
        occurrenceStart = occurrence.start,
        triggerAt = occurrence.start - lead,
        title = occurrence.title,
        timeText = timeText(occurrence.start, occurrence.end, zone, formatTime),
    )

    /** Stable across processes and re-plans: String.hashCode is specified, not per-run. */
    fun requestCode(eventId: String, start: Instant): Int = "$eventId@${start.toEpochMilliseconds()}".hashCode()

    /** "10:30–11:15", or just "10:30" for a zero-length event. */
    fun timeText(start: Instant, end: Instant, zone: TimeZone, formatTime: (LocalTime) -> String = ::defaultTime): String {
        val from = formatTime(start.toLocalDateTime(zone).time)
        if (end <= start) return from
        return "$from–${formatTime(end.toLocalDateTime(zone).time)}"
    }

    private fun defaultTime(time: LocalTime): String = String.format(Locale.ROOT, "%02d:%02d", time.hour, time.minute)
}
