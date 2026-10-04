package page.planr.android.core.recurrence

import kotlin.time.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime

/**
 * "Floating" wall-clock time: epoch milliseconds whose UTC fields carry a
 * local wall clock. Recurrence expands in this space so "09:00 daily" stays
 * 09:00 across DST, then maps each occurrence back to a real instant.
 * Port of `floatingFromRealMs` / `realFromFloatingMs` in lib/recurrence/expand.ts.
 *
 * Both directions work at whole-second precision, as `TZDate` field access does.
 */
internal object FloatingTime {

    /** Wall-clock parts of the real instant [realMs], read in [zone]. */
    fun fromReal(realMs: Long, zone: TimeZone): Long {
        val local = Instant.fromEpochMilliseconds(realMs).toLocalDateTime(zone)
        return wholeSeconds(local).toInstant(TimeZone.UTC).toEpochMilliseconds()
    }

    /**
     * The real instant of the floating [floatMs] in [zone].
     *
     * A wall time inside a spring-forward gap moves forward by the gap
     * (02:30 → 03:30), exactly like `TZDate`. A wall time inside a fall-back
     * overlap takes the earlier (summer-time) offset; `TZDate`'s pick there
     * depends on the browser's own zone (earlier in Europe/Berlin or
     * Europe/Moscow browsers, which is what the web's users run).
     */
    fun toReal(floatMs: Long, zone: TimeZone): Long {
        val wall = Instant.fromEpochMilliseconds(floatMs).toLocalDateTime(TimeZone.UTC)
        return wholeSeconds(wall).toInstant(zone).toEpochMilliseconds()
    }

    private fun wholeSeconds(value: LocalDateTime): LocalDateTime =
        LocalDateTime(value.date, LocalTime(value.hour, value.minute, value.second))
}
