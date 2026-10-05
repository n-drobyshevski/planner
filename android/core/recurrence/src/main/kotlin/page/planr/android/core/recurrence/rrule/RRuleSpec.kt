package page.planr.android.core.recurrence.rrule

import page.planr.android.core.recurrence.rrule.RRuleOptions.Key

/**
 * Normalized rule, ready to iterate: rrule.js `parseOptions` output
 * (`ParsedOptions`). All instants are floating epoch milliseconds (UTC fields
 * carry the wall clock); weekdays are 0 = MO … 6 = SU.
 *
 * `tzid` is deliberately not carried: the web never sets one (it expands in
 * floating time and maps instants back itself), and rrule.js would rezone
 * through the host system zone, which has no portable equivalent.
 */
internal class RRuleSpec(
    val freq: Frequency,
    val dtstart: Long,
    val interval: Int,
    val wkst: Int,
    val count: Int?,
    val until: Long?,
    val bysetpos: List<Int>?,
    val bymonth: List<Int>?,
    val bymonthday: List<Int>,
    val bynmonthday: List<Int>,
    val byyearday: List<Int>?,
    val byweekno: List<Int>?,
    val byweekday: List<Int>?,
    val bynweekday: List<Pair<Int, Int>>?,
    val byhour: List<Int>?,
    val byminute: List<Int>?,
    val bysecond: List<Int>?,
    val byeaster: Int?,
) {
    companion object {
        /** rrule.js `new RRule(options)` → `parseOptions`, with [dtstart] supplied by the caller. */
        fun from(options: RRuleOptions, dtstart: Long): RRuleSpec {
            val byeaster = options.byeaster
            val freq = (if (byeaster != null) Frequency.YEARLY else options.freq)
                ?: throw IllegalArgumentException("Invalid frequency in RRULE")
            val start = UtcCalendar.fields(dtstart)

            val bysetpos = options.ints(Key.BYSETPOS)
            bysetpos?.forEach { v ->
                require(v != 0 && v in -366..366) {
                    "bysetpos must be between 1 and 366, or between -366 and -1"
                }
            }

            var bymonth = options.ints(Key.BYMONTH)
            var bymonthdayRaw = options.ints(Key.BYMONTHDAY)
            val byweekno = options.ints(Key.BYWEEKNO)
            val byyearday = options.ints(Key.BYYEARDAY)
            // Weekday entries: plain indices (defaults) or parsed Weekday objects.
            var byweekdayRaw: List<Any>? = options.byweekday

            // No explicit day filter: derive one from DTSTART, like dateutil.
            if (byweekno == null && byyearday.isNullOrEmpty() && bymonthdayRaw == null &&
                byweekdayRaw == null && byeaster == null
            ) {
                when (freq) {
                    Frequency.YEARLY -> {
                        if (bymonth == null) bymonth = listOf(start.month)
                        bymonthdayRaw = listOf(start.day)
                    }
                    Frequency.MONTHLY -> bymonthdayRaw = listOf(start.day)
                    Frequency.WEEKLY -> byweekdayRaw = listOf(UtcCalendar.weekdayOf(dtstart))
                    else -> Unit
                }
            }

            val bymonthday = bymonthdayRaw.orEmpty().filter { it > 0 }
            val bynmonthday = bymonthdayRaw.orEmpty().filter { it < 0 }

            var byweekday: List<Int>? = null
            var bynweekday: List<Pair<Int, Int>>? = null
            if (byweekdayRaw != null) {
                val plain = mutableListOf<Int>()
                val nth = mutableListOf<Pair<Int, Int>>()
                for (wday in byweekdayRaw) {
                    when {
                        wday is Int -> plain += wday
                        wday is Weekday && (wday.n == null || freq > Frequency.MONTHLY) -> plain += wday.weekday
                        wday is Weekday -> nth += wday.weekday to wday.n!!
                    }
                }
                byweekday = plain.ifEmpty { null }
                bynweekday = nth.ifEmpty { null }
            }

            val byhour = options.ints(Key.BYHOUR) ?: if (freq < Frequency.HOURLY) listOf(start.hour) else null
            val byminute = options.ints(Key.BYMINUTE) ?: if (freq < Frequency.MINUTELY) listOf(start.minute) else null
            val bysecond = options.ints(Key.BYSECOND) ?: if (freq < Frequency.SECONDLY) listOf(start.second) else null
            // rrule.js loops forever on an impossible BYHOUR/BYMINUTE/BYSECOND
            // with a sub-daily FREQ; reject those instead.
            require(byhour.orEmpty().all { it in 0..23 }) { "BYHOUR out of range: $byhour" }
            require(byminute.orEmpty().all { it in 0..59 }) { "BYMINUTE out of range: $byminute" }
            require(bysecond.orEmpty().all { it in 0..59 }) { "BYSECOND out of range: $bysecond" }

            return RRuleSpec(
                freq = freq,
                dtstart = dtstart,
                interval = options.interval ?: 1,
                wkst = options.wkst?.weekday ?: 0,
                count = options.count,
                until = options.until,
                bysetpos = bysetpos,
                bymonth = bymonth,
                bymonthday = bymonthday,
                bynmonthday = bynmonthday,
                byyearday = byyearday,
                byweekno = byweekno,
                byweekday = byweekday,
                bynweekday = bynweekday,
                byhour = byhour,
                byminute = byminute,
                bysecond = bysecond,
                byeaster = byeaster,
            )
        }
    }
}
