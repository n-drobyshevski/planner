package page.planr.android.core.data.model

import kotlin.time.Instant
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atTime
import kotlinx.datetime.minus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime

/** Where a night's bedtime / wake came from (`sleep_logs.times_source`). */
enum class SleepTimesSource(val wire: String) {
    /** typed in a check-in (web or phone) */
    Manual("manual"),

    /** synced from Health Connect by [page.planr.android.core.data.health.HealthSleepSync] */
    HealthConnect("health_connect"),
    ;

    companion object {
        /** Anything but `health_connect` reads as [Manual], as the web's mapSleepLog does. */
        fun fromWire(value: String?): SleepTimesSource = if (value == HealthConnect.wire) HealthConnect else Manual
    }
}

/**
 * One of the member's nights (lib/types.ts `SleepLog`), keyed by the WAKE
 * date. Member-private under RLS. [quality] is 1..7 (poor → great),
 * [fatigue] 1..9 (Karolinska, alert → fighting sleep). Stage minutes come
 * from the device only; null when it reported none.
 */
data class SleepLog(
    val date: LocalDate,
    val bedtimeAt: Instant? = null,
    val wokeAt: Instant? = null,
    val timesSource: SleepTimesSource = SleepTimesSource.Manual,
    val quality: Int? = null,
    val fatigue: Int? = null,
    val note: String? = null,
    val asleepMin: Int? = null,
    val deepMin: Int? = null,
    val lightMin: Int? = null,
    val remMin: Int? = null,
    val awakeMin: Int? = null,
) {
    /**
     * Rated (or noted) by the member: device-sync-only rows carry times and
     * stages, so the morning check-in still asks (device-times.ts `isRatedLog`).
     */
    val isRated: Boolean get() = quality != null || fatigue != null || note != null

    val fromHealthConnect: Boolean get() = timesSource == SleepTimesSource.HealthConnect

    /** Any stage minutes at all (stages-section.tsx `stageNights`). */
    val hasStages: Boolean get() = deepMin != null || lightMin != null || remMin != null
}

/** A night's bedtime and wake as instants; either may be blank. */
data class SleepTimes(val bedtimeAt: Instant?, val wokeAt: Instant?) {
    companion object {
        /**
         * Wall-clock times against the WAKE [date] (log-fields.tsx
         * `draftToInstants`): the wake time is on [date]; a bedtime from noon
         * on belongs to the evening before, an earlier one to the small hours
         * of [date] itself.
         */
        fun fromWallClock(date: LocalDate, bedtime: LocalTime?, wake: LocalTime?, zone: TimeZone): SleepTimes {
            val woke = wake?.let { date.atTime(it).toInstant(zone) }
            val bed = bedtime?.let {
                val day = if (it.hour >= 12) date.minus(DatePeriod(days = 1)) else date
                day.atTime(it).toInstant(zone)
            }
            return SleepTimes(bed, woke)
        }
    }
}

/**
 * What a check-in saves. [times] null keeps the stored times (and their
 * source); otherwise they are written as typed, unless [keepDeviceTimes]
 * drops them first.
 */
data class SleepRating(
    val date: LocalDate,
    val quality: Int?,
    val fatigue: Int?,
    val note: String?,
    val times: SleepTimes? = null,
)

/**
 * Drops [times] that would only echo the device's (device-times.ts
 * `keepDeviceTimes`): on a night synced from Health Connect, blank times and
 * times equal to the stored ones to the minute (the sheet prefills them at
 * minute precision) leave the device's times and source alone. Times the
 * member actually changed go through and become manual.
 */
fun keepDeviceTimes(times: SleepTimes?, existing: SleepLog?): SleepTimes? {
    if (times == null || existing?.timesSource != SleepTimesSource.HealthConnect) return times
    val blank = times.bedtimeAt == null && times.wokeAt == null
    val same = sameMinute(times.bedtimeAt, existing.bedtimeAt) && sameMinute(times.wokeAt, existing.wokeAt)
    return if (blank || same) null else times
}

private fun sameMinute(a: Instant?, b: Instant?): Boolean {
    if (a == null || b == null) return a == b
    return Math.floorDiv(a.toEpochMilliseconds(), MINUTE_MS) == Math.floorDiv(b.toEpochMilliseconds(), MINUTE_MS)
}

private const val MINUTE_MS = 60_000L

/**
 * The rating sheet's shared rules, so the agenda's check-in and the Insights
 * Sleep tab prefill and save a night the same way.
 */
object SleepRatings {
    /** No stored times anywhere: a typical night. */
    val DEFAULT_BEDTIME = LocalTime(23, 0)
    val DEFAULT_WAKE = LocalTime(7, 0)

    /**
     * The times the sheet opens with for [date]: the night's own, else the
     * latest night's that has both, else 23:00 / 07:00, as wall clock in [zone].
     */
    fun prefill(date: LocalDate, logs: List<SleepLog>, zone: TimeZone): Pair<LocalTime, LocalTime> {
        val own = logs.firstOrNull { it.date == date }?.takeIf { it.bedtimeAt != null && it.wokeAt != null }
        val source = own ?: logs
            .filter { it.date <= date && it.bedtimeAt != null && it.wokeAt != null }
            .maxByOrNull { it.date }
        val bed = source?.bedtimeAt?.toLocalDateTime(zone)?.time?.atMinute() ?: DEFAULT_BEDTIME
        val wake = source?.wokeAt?.toLocalDateTime(zone)?.time?.atMinute() ?: DEFAULT_WAKE
        return bed to wake
    }

    /**
     * The sheet's values as a [SleepRating]. Times are sent for a night with
     * no row yet (a manual check-in) or when the member touched a time
     * ([timesEdited]); otherwise the stored ones stay. A blank note is none.
     */
    fun rating(
        date: LocalDate,
        bedtime: LocalTime,
        wake: LocalTime,
        timesEdited: Boolean,
        quality: Int?,
        fatigue: Int?,
        note: String,
        existing: SleepLog?,
        zone: TimeZone,
    ): SleepRating {
        val times = if (existing == null || timesEdited) SleepTimes.fromWallClock(date, bedtime, wake, zone) else null
        return SleepRating(
            date = date,
            quality = quality,
            fatigue = fatigue,
            note = note.trim().takeIf { it.isNotEmpty() }?.take(NOTE_MAX),
            times = times,
        )
    }

    /** The note's limit, as on the web (maxLength 200). */
    const val NOTE_MAX = 200

    private fun LocalTime.atMinute(): LocalTime = LocalTime(hour, minute)
}
