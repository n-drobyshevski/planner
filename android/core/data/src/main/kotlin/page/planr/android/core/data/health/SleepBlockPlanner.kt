package page.planr.android.core.data.health

import java.time.LocalDate
import java.time.ZoneId
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/** The member's sleep settings that decide which calendar block is a night (`member_sleep_prefs`). */
data class SleepBlockPrefs(
    /** a dedicated sleep category; null = inactive blocks count as sleep */
    val sleepCategoryId: String? = null,
    val nightWindowStartHour: Int = 20,
    val nightWindowEndHour: Int = 12,
    /** "Adjust sleep blocks from check-ins": off = never touch the calendar */
    val autoAdjust: Boolean = true,
)

/** What to do with the calendar for one night. */
sealed interface SleepBlockPlan {
    data class Create(val start: Instant, val end: Instant) : SleepBlockPlan
    data class UpdateSingle(val eventId: String, val start: Instant, val end: Instant) : SleepBlockPlan
    /** a recurring routine: this night only, never the series */
    data class Override(val eventId: String, val occurrenceDate: Instant, val start: Instant, val end: Instant) : SleepBlockPlan
    /** the block already matches the night */
    data object Unchanged : SleepBlockPlan
}

/**
 * Port of the web's lib/sleep/sync-block.ts (+ `nightWindowFor` and
 * `isViewerSleep`), so a night from Health Connect snaps the same block a
 * check-in on the web would.
 */
object SleepBlockPlanner {
    /** Within this, a block already says what the tracker says. */
    private val SAME = 1.minutes

    /** The night that ends on [date]: [startHour] the evening before to [endHour] on [date]. */
    fun nightWindow(date: LocalDate, zone: ZoneId, startHour: Int, endHour: Int): TimeWindow = TimeWindow(
        start = date.minusDays(1).atTime(startHour, 0).atZone(zone).toInstant().toKotlin(),
        end = date.atTime(endHour, 0).atZone(zone).toInstant().toKotlin(),
    )

    /** The viewer's own timed sleep: their sleep category, or inactive blocks without one. */
    fun isViewerSleep(o: Occurrence, viewerId: String, sleepCategoryId: String?): Boolean =
        viewerId.isNotEmpty() &&
            o.ownerId == viewerId &&
            !o.allDay &&
            o.kind == EventKind.Event &&
            (if (sleepCategoryId != null) o.categoryId == sleepCategoryId else o.inactive)

    /**
     * The night's block is the sleep occurrence with the most time inside
     * [window] (ties: the earlier start), as the web's derived nights pick it.
     */
    fun plan(bedtime: Instant, woke: Instant, sleep: List<Occurrence>, window: TimeWindow): SleepBlockPlan {
        val best = sleep
            .map { it to (minOf(it.end, window.end) - maxOf(it.start, window.start)) }
            .filter { (_, overlap) -> overlap.isPositive() }
            .minWithOrNull(compareByDescending<Pair<Occurrence, kotlin.time.Duration>> { it.second }.thenBy { it.first.start })
            ?.first
            ?: return SleepBlockPlan.Create(bedtime, woke)
        if ((best.start - bedtime).absoluteValue < SAME && (best.end - woke).absoluteValue < SAME) {
            return SleepBlockPlan.Unchanged
        }
        return if (best.isRecurring) {
            SleepBlockPlan.Override(best.eventId, best.occurrenceDate, bedtime, woke)
        } else {
            SleepBlockPlan.UpdateSingle(best.eventId, bedtime, woke)
        }
    }

    internal fun java.time.Instant.toKotlin(): Instant = Instant.fromEpochMilliseconds(toEpochMilli())
}
