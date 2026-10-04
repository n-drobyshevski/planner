package page.planr.android.core.recurrence

import kotlin.time.Instant
import kotlinx.datetime.DayOfWeek
import page.planr.android.core.recurrence.rrule.Frequency
import page.planr.android.core.recurrence.rrule.RRuleOptions
import page.planr.android.core.recurrence.rrule.UtcCalendar

/** Recurrence frequencies the editor offers (`Freq` in rrule-build.ts). */
enum class Freq { DAILY, WEEKLY, MONTHLY }

/** How a series ends (`RecurrenceEnd`). */
sealed interface RecurrenceEnd {
    data object Never : RecurrenceEnd

    /** UNTIL, an instant (serialized as RFC 5545 UTC basic form `YYYYMMDDTHHMMSSZ`). */
    data class Until(val date: Instant) : RecurrenceEnd

    data class Count(val count: Int) : RecurrenceEnd
}

/**
 * The recurrence editor's form state (`RecurrenceForm`). [byWeekday] is used
 * for WEEKLY rules and for DAILY rules acting as a weekday filter; the TS
 * 0=Mon..6=Sun indices map to [DayOfWeek] ordinals one to one.
 */
data class RecurrenceForm(
    val freq: Freq,
    /** Repeat every N units; 1 omits INTERVAL from the output. */
    val interval: Int = 1,
    val byWeekday: Set<DayOfWeek> = emptySet(),
    val end: RecurrenceEnd = RecurrenceEnd.Never,
)

/**
 * RecurrenceForm <-> RFC 5545 RRULE string (no DTSTART line). Port of
 * `buildRRule` / `parseRRule` in lib/recurrence/rrule-build.ts; output strings
 * must be byte-identical to the web's (part order FREQ, INTERVAL, BYDAY,
 * UNTIL|COUNT; days sorted Mon..Sun).
 *
 * The human summary (`summarizeRecurrence`) is UI copy and lives with the
 * Android string resources, not here.
 */
object RRuleBuild {

    /** Builds the RRULE for [form]; null in, null out. */
    fun buildRRule(form: RecurrenceForm?): String? {
        if (form == null) return null

        // BYDAY applies to weekly recurrences and to daily recurrences used as a
        // weekday filter ("every weekday", "Mon/Wed/Fri").
        val hasDays = (form.freq == Freq.WEEKLY || form.freq == Freq.DAILY) && form.byWeekday.isNotEmpty()

        val parts = mutableListOf("FREQ=${form.freq.name}")

        // A daily weekday filter is really a weekly cadence; INTERVAL would mean
        // "every N days" and drift off the chosen weekdays, so it is omitted there.
        val showInterval = form.interval > 1 && !(form.freq == Freq.DAILY && hasDays)
        if (showInterval) parts += "INTERVAL=${form.interval}"

        if (hasDays) {
            parts += "BYDAY=" + form.byWeekday.sortedBy { it.ordinal }.joinToString(",") { WEEKDAY_CODES[it.ordinal] }
        }

        when (val end = form.end) {
            is RecurrenceEnd.Until -> parts += "UNTIL=${toUntilBasic(end.date)}"
            is RecurrenceEnd.Count -> parts += "COUNT=${end.count}"
            RecurrenceEnd.Never -> Unit
        }
        return parts.joinToString(";")
    }

    /** Parses an RRULE back into form state; null in, null out. Unknown FREQ reads as WEEKLY. */
    fun parseRRule(rrule: String?): RecurrenceForm? {
        if (rrule == null) return null
        val options = RRuleOptions.parse(rrule)

        val freq = when (options.freq) {
            Frequency.DAILY -> Freq.DAILY
            Frequency.MONTHLY -> Freq.MONTHLY
            else -> Freq.WEEKLY
        }
        val interval = options.interval?.takeIf { it > 1 } ?: 1
        // nth weekdays (`-1FR`) keep only their day, as on the web.
        val byWeekday = options.byweekday.orEmpty().mapTo(mutableSetOf()) { DayOfWeek.entries[it.weekday] }

        val until = options.until
        val count = options.count
        val end = when {
            until != null -> RecurrenceEnd.Until(Instant.fromEpochMilliseconds(until))
            count != null -> RecurrenceEnd.Count(count)
            else -> RecurrenceEnd.Never
        }
        return RecurrenceForm(freq, interval, byWeekday, end)
    }

    /** RRULE weekday codes in [DayOfWeek] order (Mon..Sun). */
    private val WEEKDAY_CODES = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")

    /** RFC 5545 UTC basic form `YYYYMMDDTHHMMSSZ` (`toUntilBasic`; the year is not zero-padded). */
    private fun toUntilBasic(date: Instant): String {
        val f = UtcCalendar.fields(date.toEpochMilliseconds())
        val pad = UtcCalendar::pad2
        return "${f.year}${pad(f.month)}${pad(f.day)}T${pad(f.hour)}${pad(f.minute)}${pad(f.second)}Z"
    }
}
