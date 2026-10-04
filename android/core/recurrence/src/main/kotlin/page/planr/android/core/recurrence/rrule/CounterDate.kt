package page.planr.android.core.recurrence.rrule

/**
 * The mutable period cursor of rrule.js's iterator (`DateTime` in
 * datetime.ts): calendar fields stepped by FREQ × INTERVAL. Fields may
 * transiently overflow (a MONTHLY cursor keeps day 31 in February); only the
 * fields each frequency reads are meaningful.
 */
internal class CounterDate(
    var year: Int,
    var month: Int,
    var day: Int,
    var hour: Int,
    var minute: Int,
    var second: Int,
    val millisecond: Int,
) {
    private val weekday: Int
        get() = UtcCalendar.weekdayOf(UtcCalendar.utcMillis(year, month - 1, day, hour, minute, second, millisecond))

    fun add(rule: RRuleSpec, filtered: Boolean) {
        when (rule.freq) {
            Frequency.YEARLY -> year += rule.interval
            Frequency.MONTHLY -> addMonths(rule.interval)
            Frequency.WEEKLY -> addWeekly(rule.interval, rule.wkst)
            Frequency.DAILY -> addDaily(rule.interval)
            Frequency.HOURLY -> addHours(rule.interval, filtered, rule.byhour)
            Frequency.MINUTELY -> addMinutes(rule.interval, filtered, rule.byhour, rule.byminute)
            Frequency.SECONDLY -> addSeconds(rule.interval, filtered, rule.byhour, rule.byminute, rule.bysecond)
        }
    }

    private fun addMonths(months: Int) {
        month += months
        if (month > 12) {
            val yearDiv = Math.floorDiv(month, 12)
            val monthMod = Math.floorMod(month, 12)
            month = monthMod
            year += yearDiv
            if (month == 0) {
                month = 12
                --year
            }
        }
    }

    private fun addWeekly(weeks: Int, wkst: Int) {
        val wd = weekday
        day += if (wkst > wd) -(wd + 1 + (6 - wkst)) + weeks * 7 else -(wd - wkst) + weeks * 7
        fixDay()
    }

    private fun addDaily(days: Int) {
        day += days
        fixDay()
    }

    private fun addHours(hours: Int, filtered: Boolean, byhour: List<Int>?) {
        if (filtered) {
            // Jump to one iteration before the next day.
            hour += Math.floorDiv(23 - hour, hours) * hours
        }
        while (true) {
            hour += hours
            val dayDiv = Math.floorDiv(hour, 24)
            if (dayDiv != 0) {
                hour = Math.floorMod(hour, 24)
                addDaily(dayDiv)
            }
            if (byhour.isNullOrEmpty() || hour in byhour) break
        }
    }

    private fun addMinutes(minutes: Int, filtered: Boolean, byhour: List<Int>?, byminute: List<Int>?) {
        if (filtered) {
            minute += Math.floorDiv(1439 - (hour * 60 + minute), minutes) * minutes
        }
        while (true) {
            minute += minutes
            val hourDiv = Math.floorDiv(minute, 60)
            if (hourDiv != 0) {
                minute = Math.floorMod(minute, 60)
                addHours(hourDiv, false, byhour)
            }
            if ((byhour.isNullOrEmpty() || hour in byhour) && (byminute.isNullOrEmpty() || minute in byminute)) break
        }
    }

    private fun addSeconds(
        seconds: Int,
        filtered: Boolean,
        byhour: List<Int>?,
        byminute: List<Int>?,
        bysecond: List<Int>?,
    ) {
        if (filtered) {
            second += Math.floorDiv(86399 - (hour * 3600 + minute * 60 + second), seconds) * seconds
        }
        while (true) {
            second += seconds
            val minuteDiv = Math.floorDiv(second, 60)
            if (minuteDiv != 0) {
                second = Math.floorMod(second, 60)
                addMinutes(minuteDiv, false, byhour, byminute)
            }
            if ((byhour.isNullOrEmpty() || hour in byhour) &&
                (byminute.isNullOrEmpty() || minute in byminute) &&
                (bysecond.isNullOrEmpty() || second in bysecond)
            ) {
                break
            }
        }
    }

    private fun fixDay() {
        if (day <= 28) return
        var daysInMonth = UtcCalendar.daysInMonth(year, month)
        if (day <= daysInMonth) return
        while (day > daysInMonth) {
            day -= daysInMonth
            ++month
            if (month == 13) {
                month = 1
                ++year
                if (year > UtcCalendar.MAXYEAR) return
            }
            daysInMonth = UtcCalendar.daysInMonth(year, month)
        }
    }

    companion object {
        /** `DateTime.fromDate`: the cursor starts on DTSTART's (floating) fields. */
        fun of(ms: Long): CounterDate {
            val f = UtcCalendar.fields(ms)
            // JS `valueOf() % 1000` keeps the dividend's sign.
            return CounterDate(f.year, f.month, f.day, f.hour, f.minute, f.second, (ms % 1000).toInt())
        }
    }
}
