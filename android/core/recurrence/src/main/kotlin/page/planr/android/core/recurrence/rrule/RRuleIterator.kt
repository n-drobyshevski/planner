package page.planr.android.core.recurrence.rrule

/**
 * Occurrence generation for one rule: rrule.js `iter()` (iter/index.ts,
 * iter/poslist.ts) driven the way `RRule.between(after, before, inc)` drives
 * it. Works on floating epoch milliseconds throughout.
 *
 * Kept deliberately close to the JS, quirks included, because the web's
 * output is the contract:
 * - UNTIL is compared against the floating occurrence (wall clock vs UTC digits).
 * - COUNT counts every occurrence from DTSTART, including ones before `after`.
 * - BYHOUR/BYMINUTE/BYSECOND are emitted in the order given, not sorted.
 * - BYSETPOS does not de-duplicate positions that resolve to the same instant.
 */
internal class RRuleIterator(private val rule: RRuleSpec) {

    /** `RRule.between(after, before, inc)`: occurrences in `[after, before]` (or open when ![inc]). */
    fun between(after: Long, before: Long, inc: Boolean): List<Long> {
        val minDate = if (inc) after else after + 1
        val maxDate = if (inc) before else before - 1
        val out = mutableListOf<Long>()
        iterate { date ->
            when {
                date < minDate -> true
                date > maxDate -> false
                else -> {
                    out += date
                    true
                }
            }
        }
        return out
    }

    /**
     * Feeds each occurrence (ascending per period) to [accept] until it
     * returns false, COUNT/UNTIL is reached, or the year passes 9999.
     */
    fun iterate(accept: (Long) -> Boolean) {
        var count = rule.count
        if (count == 0 || rule.interval == 0) return

        val dtstart = rule.dtstart
        val until = rule.until
        val counter = CounterDate.of(dtstart)
        val ii = IterInfo(rule)
        ii.rebuild(counter.year, counter.month)
        var timeset = initialTimeset(ii, counter)

        /** Emits one candidate; false ends the iteration. */
        fun emit(res: Long): Boolean {
            if (until != null && res > until) return false
            if (res >= dtstart) {
                if (!accept(res)) return false
                if (count != null) {
                    count = count!! - 1
                    if (count == 0) return false
                }
            }
            return true
        }

        while (true) {
            val period = daySet(ii, counter)
            val filtered = removeFilteredDays(period, ii)
            val bysetpos = rule.bysetpos

            if (!bysetpos.isNullOrEmpty()) {
                for (res in posList(bysetpos, timeset, period, ii)) {
                    if (!emit(res)) return
                }
            } else {
                for (j in period.start until period.end) {
                    val day = period.days[j]
                    if (day < 0) continue
                    val date = (ii.yearordinal + day) * UtcCalendar.DAY_MS
                    for (time in timeset) {
                        if (!emit(date + time)) return
                    }
                }
            }

            counter.add(rule, filtered)
            if (counter.year > UtcCalendar.MAXYEAR) return
            if (!rule.freq.isDailyOrGreater) {
                timeset = subDailyTimeset(counter.hour, counter.minute, counter.second, 0)
            }
            ii.rebuild(counter.year, counter.month)
        }
    }

    /**
     * One period's candidate days (`getdayset`): day-of-year indices in
     * `[start, end)`, -1 where a day is absent or filtered out.
     */
    private class DaySet(val days: IntArray, val start: Int, val end: Int)

    private fun daySet(ii: IterInfo, counter: CounterDate): DaySet = when (rule.freq) {
        Frequency.YEARLY -> DaySet(IntArray(ii.yearlen) { it }, 0, ii.yearlen)
        Frequency.MONTHLY -> {
            val start = ii.mrange[counter.month - 1]
            val end = ii.mrange[counter.month]
            DaySet(IntArray(ii.yearlen) { if (it in start until end) it else -1 }, start, end)
        }
        Frequency.WEEKLY -> {
            // Cross-year weeks: the set runs 7 days past the year end.
            val days = IntArray(ii.yearlen + 7) { -1 }
            var i = dayOfYear(ii, counter)
            val start = i
            for (j in 0 until 7) {
                days[i] = i
                ++i
                if (ii.wdaymask[i] == rule.wkst) break
            }
            DaySet(days, start, i)
        }
        else -> {
            val days = IntArray(ii.yearlen) { -1 }
            val i = dayOfYear(ii, counter)
            days[i] = i
            DaySet(days, i, i + 1)
        }
    }

    private fun dayOfYear(ii: IterInfo, counter: CounterDate): Int =
        (Math.floorDiv(UtcCalendar.utcMillis(counter.year, counter.month - 1, counter.day), UtcCalendar.DAY_MS) -
            ii.yearordinal).toInt()

    /** Nulls out filtered days; returns whether the LAST day examined was filtered (as rrule.js does). */
    private fun removeFilteredDays(period: DaySet, ii: IterInfo): Boolean {
        var filtered = false
        for (j in period.start until period.end) {
            val day = period.days[j]
            filtered = isFiltered(ii, day)
            if (filtered) period.days[j] = -1
        }
        return filtered
    }

    private fun isFiltered(ii: IterInfo, day: Int): Boolean {
        val r = rule
        if (!r.bymonth.isNullOrEmpty() && ii.mmask[day] !in r.bymonth) return true
        val wnomask = ii.wnomask
        if (!r.byweekno.isNullOrEmpty() && (wnomask == null || wnomask.getOrElse(day) { 0 } == 0)) return true
        if (!r.byweekday.isNullOrEmpty() && ii.wdaymask[day] !in r.byweekday) return true
        if (ii.nwdaymask.isNotEmpty() && ii.nwdaymask.getOrElse(day) { 0 } == 0) return true
        if (r.byeaster != null && day !in (ii.eastermask ?: IntArray(0))) return true
        if ((r.bymonthday.isNotEmpty() || r.bynmonthday.isNotEmpty()) &&
            ii.mdaymask[day] !in r.bymonthday && ii.nmdaymask[day] !in r.bynmonthday
        ) {
            return true
        }
        val byyearday = r.byyearday
        if (!byyearday.isNullOrEmpty()) {
            val yearlen = ii.yearlen
            val miss = if (day < yearlen) {
                (day + 1) !in byyearday && (-yearlen + day) !in byyearday
            } else {
                (day + 1 - yearlen) !in byyearday && (-ii.nextyearlen + day - yearlen) !in byyearday
            }
            if (miss) return true
        }
        return false
    }

    /** `buildPoslist`: the BYSETPOS picks of one period, sorted. */
    private fun posList(bysetpos: List<Int>, timeset: List<Long>, period: DaySet, ii: IterInfo): List<Long> {
        if (timeset.isEmpty()) return emptyList()
        val present = (period.start until period.end).map { period.days[it] }.filter { it >= 0 }
        val out = mutableListOf<Long>()
        for (pos in bysetpos) {
            val daypos: Int
            val timepos: Int
            if (pos < 0) {
                daypos = Math.floorDiv(pos, timeset.size)
                timepos = Math.floorMod(pos, timeset.size)
            } else {
                daypos = Math.floorDiv(pos - 1, timeset.size)
                timepos = Math.floorMod(pos - 1, timeset.size)
            }
            // Out-of-range positions resolve to an invalid date in rrule.js,
            // which never passes the `>= dtstart` check; skip them here.
            val day = (if (daypos < 0) present.getOrNull(present.size + daypos) else present.getOrNull(daypos))
                ?: continue
            out += (ii.yearordinal + day) * UtcCalendar.DAY_MS + timeset[timepos]
        }
        out.sort()
        return out
    }

    /** `makeTimeset`: times of day (ms) for the first period. */
    private fun initialTimeset(ii: IterInfo, counter: CounterDate): List<Long> {
        val r = rule
        if (r.freq.isDailyOrGreater) {
            // `buildTimeset`: byhour × byminute × bysecond in the given order.
            val millis = (r.dtstart % 1000)
            val out = mutableListOf<Long>()
            for (h in r.byhour.orEmpty()) for (m in r.byminute.orEmpty()) for (s in r.bysecond.orEmpty()) {
                out += timeOfDay(h, m, s, millis)
            }
            return out
        }
        if ((r.freq >= Frequency.HOURLY && !r.byhour.isNullOrEmpty() && counter.hour !in r.byhour) ||
            (r.freq >= Frequency.MINUTELY && !r.byminute.isNullOrEmpty() && counter.minute !in r.byminute) ||
            (r.freq >= Frequency.SECONDLY && !r.bysecond.isNullOrEmpty() && counter.second !in r.bysecond)
        ) {
            return emptyList()
        }
        return subDailyTimeset(counter.hour, counter.minute, counter.second, counter.millisecond.toLong())
    }

    /** `gettimeset(freq)` for HOURLY / MINUTELY / SECONDLY. */
    private fun subDailyTimeset(hour: Int, minute: Int, second: Int, millis: Long): List<Long> = when (rule.freq) {
        Frequency.HOURLY -> rule.byminute.orEmpty()
            .flatMap { m -> rule.bysecond.orEmpty().map { s -> timeOfDay(hour, m, s, millis) }.sorted() }
            .sorted()
        Frequency.MINUTELY -> rule.bysecond.orEmpty().map { s -> timeOfDay(hour, minute, s, millis) }.sorted()
        else -> listOf(timeOfDay(hour, minute, second, millis))
    }

    private fun timeOfDay(hour: Int, minute: Int, second: Int, millis: Long): Long =
        hour * 3_600_000L + minute * 60_000L + second * 1_000L + millis
}
