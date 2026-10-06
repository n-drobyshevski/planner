package page.planr.android.feature.tasks.model

import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.atTime
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/**
 * Where "Add to calendar" proposes to put a task: the date, and the first
 * free start on it. Pure, so the view model only feeds it the cache.
 */
object BlockSlots {
    /** The web dialog's durations, in minutes. */
    val DURATIONS: List<Int> = listOf(15, 30, 45, 60, 90, 120)

    /** The model has no time estimate yet, so every block starts at half an hour. */
    const val DEFAULT_MINUTES: Int = 30

    /** The part of the day a block is proposed in, local wall-clock time. */
    val DAY_START: LocalTime = LocalTime(8, 0)
    val DAY_END: LocalTime = LocalTime(22, 0)

    /** Proposed starts sit on the quarter hour. */
    val STEP: Duration = 15.minutes

    /** The task's due date when it is still ahead, else today. */
    fun defaultDate(dueDate: LocalDate?, today: LocalDate): LocalDate =
        if (dueDate != null && dueDate > today) dueDate else today

    /** The local day [date] spans in [zone], for reading the occurrence cache. */
    fun dayWindow(date: LocalDate, zone: TimeZone): TimeWindow =
        TimeWindow(date.atStartOfDayIn(zone), date.plus(DatePeriod(days = 1)).atStartOfDayIn(zone))

    /**
     * Whether [occurrence] keeps [memberId] busy: their own events and joint
     * ones, timed, not cancelled, and not a context backdrop. The partner's
     * personal events and all-day items don't take up the member's time.
     */
    fun isBusy(occurrence: Occurrence, memberId: String?): Boolean =
        !occurrence.allDay &&
            occurrence.status != EventStatus.Cancelled &&
            occurrence.kind != EventKind.Context &&
            (occurrence.ownerId == memberId || occurrence.isShared)

    /**
     * The first quarter-hour start on [date] (in [zone]) where a block of
     * [duration] fits between [DAY_START] and [DAY_END] without overlapping
     * anything [isBusy] for [memberId], and not before [now]. Null when the
     * day has no such gap (or is already over).
     *
     * Starts are stepped on absolute time from the day's 08:00, so a DST
     * change shifts nothing: every step is still a local quarter hour, and
     * the window is whatever 08:00–22:00 measures that day.
     */
    fun nextFreeSlot(
        date: LocalDate,
        zone: TimeZone,
        duration: Duration,
        occurrences: List<Occurrence>,
        memberId: String?,
        now: Instant,
    ): Instant? {
        require(duration.isPositive()) { "duration must be positive: $duration" }
        val dayStart = date.atTime(DAY_START).toInstant(zone)
        val dayEnd = date.atTime(DAY_END).toInstant(zone)
        val busy = occurrences.filter { isBusy(it, memberId) && it.end > dayStart && it.start < dayEnd }

        // The first step at or after [at], rounding up.
        fun onGrid(at: Instant): Instant {
            if (at <= dayStart) return dayStart
            val step = STEP.inWholeMilliseconds
            val steps = ((at - dayStart).inWholeMilliseconds + step - 1) / step
            return dayStart + (steps * step).milliseconds
        }

        var start = onGrid(now)
        while (start + duration <= dayEnd) {
            val end = start + duration
            // Jump past the latest-ending clash, not just the first: one step per overlap group.
            val clash = busy.filter { it.start < end && it.end > start }.maxOfOrNull { it.end } ?: return start
            start = onGrid(clash)
        }
        return null
    }

    /**
     * The proposed start time on [date]: [nextFreeSlot] when there is one,
     * else the next full hour after [now] (the slot to edit from on a full
     * or finished day).
     */
    fun defaultStart(
        date: LocalDate,
        zone: TimeZone,
        duration: Duration,
        occurrences: List<Occurrence>,
        memberId: String?,
        now: Instant,
    ): LocalTime =
        nextFreeSlot(date, zone, duration, occurrences, memberId, now)?.toLocalDateTime(zone)?.time
            ?: nextFullHour(now, zone)

    /** 14:20 → 15:00, 14:00 → 15:00; after 23:00 it wraps to midnight. */
    fun nextFullHour(now: Instant, zone: TimeZone): LocalTime =
        LocalTime((now.toLocalDateTime(zone).hour + 1) % 24, 0)
}
