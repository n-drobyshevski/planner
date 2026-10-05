package page.planr.android.core.recurrence.rrule

import page.planr.android.core.recurrence.rrule.UtcCalendar.pymod

/**
 * Per-year (and, for nth-weekday rules, per-month) lookup masks: rrule.js
 * `Iterinfo` with `yearinfo.ts`, `monthinfo.ts`, `easter.ts` and `masks.ts`.
 * Indices are day-of-year offsets (0 = Jan 1); every mask runs 7 days past
 * the year end so cross-year weekly periods can be looked up.
 */
internal class IterInfo(private val rule: RRuleSpec) {
    private var year = Int.MIN_VALUE
    private var month = Int.MIN_VALUE

    var yearlen = 0; private set
    var nextyearlen = 0; private set
    /** Epoch day of Jan 1 (`yearordinal`). */
    var yearordinal = 0L; private set
    lateinit var mmask: IntArray; private set
    lateinit var mdaymask: IntArray; private set
    lateinit var nmdaymask: IntArray; private set
    lateinit var wdaymask: IntArray; private set
    lateinit var mrange: IntArray; private set
    var wnomask: IntArray? = null; private set
    /** 1 where an nth-weekday rule (`-1FR`) matches; empty when not applicable. */
    var nwdaymask: IntArray = IntArray(0); private set
    var eastermask: IntArray? = null; private set

    fun rebuild(year: Int, month: Int) {
        if (year != this.year) rebuildYear(year)
        if (!rule.bynweekday.isNullOrEmpty() && (month != this.month || year != this.year)) {
            rebuildMonth(month)
        }
        if (rule.byeaster != null) eastermask = intArrayOf(easter(year, rule.byeaster))
        this.year = year
        this.month = month
    }

    private fun rebuildYear(year: Int) {
        val leap = UtcCalendar.isLeapYear(year)
        yearlen = if (leap) 366 else 365
        nextyearlen = if (UtcCalendar.isLeapYear(year + 1)) 366 else 365
        yearordinal = UtcCalendar.epochDay(year, 1, 1)
        val yearweekday = UtcCalendar.weekdayOfEpochDay(yearordinal)
        mmask = if (leap) M366MASK else M365MASK
        mdaymask = if (leap) MDAY366MASK else MDAY365MASK
        nmdaymask = if (leap) NMDAY366MASK else NMDAY365MASK
        mrange = if (leap) M366RANGE else M365RANGE
        wdaymask = IntArray(WDAYMASK_LENGTH - yearweekday) { (yearweekday + it) % 7 }
        wnomask = rule.byweekno?.takeIf { it.isNotEmpty() }?.let { buildWeekNoMask(year, yearweekday, it) }
    }

    private fun buildWeekNoMask(year: Int, yearweekday: Int, byweekno: List<Int>): IntArray {
        val wkst = rule.wkst
        val mask = IntArray(yearlen + 7)
        val firstwkst = pymod(7 - yearweekday + wkst, 7)
        var no1wkst = firstwkst
        val wyearlen: Int
        if (no1wkst >= 4) {
            no1wkst = 0
            // Days in the year plus the days we got from last year.
            wyearlen = yearlen + pymod(yearweekday - wkst, 7)
        } else {
            // Days in the year minus the days we left in last year.
            wyearlen = yearlen - no1wkst
        }
        val div = Math.floorDiv(wyearlen, 7)
        val mod = pymod(wyearlen, 7)
        val numweeks = Math.floor(div + mod / 4.0).toInt()

        for (raw in byweekno) {
            var n = raw
            if (n < 0) n += numweeks + 1
            if (!(n > 0 && n <= numweeks)) continue
            var i: Int
            if (n > 1) {
                i = no1wkst + (n - 1) * 7
                if (no1wkst != firstwkst) i -= 7 - firstwkst
            } else {
                i = no1wkst
            }
            for (k in 0 until 7) {
                if (i in mask.indices) mask[i] = 1
                i++
                if (wdaymask[i] == wkst) break
            }
        }

        if (1 in byweekno) {
            // Week number 1 of next year as well.
            var i = no1wkst + numweeks * 7
            if (no1wkst != firstwkst) i -= 7 - firstwkst
            if (i < yearlen) {
                for (j in 0 until 7) {
                    if (i in mask.indices) mask[i] = 1
                    i += 1
                    if (wdaymask[i] == wkst) break
                }
            }
        }

        if (no1wkst != 0) {
            // Last week number of last year, when it spills into this year.
            val lnumweeks: Int
            if (-1 !in byweekno) {
                val lyearweekday = UtcCalendar.weekdayOfEpochDay(UtcCalendar.epochDay(year - 1, 1, 1))
                var lno1wkst = pymod(7 - lyearweekday + wkst, 7)
                val lyearlen = if (UtcCalendar.isLeapYear(year - 1)) 366 else 365
                val weekst: Int
                if (lno1wkst >= 4) {
                    lno1wkst = 0
                    weekst = lyearlen + pymod(lyearweekday - wkst, 7)
                } else {
                    weekst = yearlen - no1wkst
                }
                lnumweeks = Math.floor(52 + pymod(weekst, 7) / 4.0).toInt()
            } else {
                lnumweeks = -1
            }
            if (lnumweeks in byweekno) {
                for (i in 0 until no1wkst) mask[i] = 1
            }
        }
        return mask
    }

    private fun rebuildMonth(month: Int) {
        val ranges = mutableListOf<IntArray>()
        when (rule.freq) {
            Frequency.YEARLY -> {
                val bymonth = rule.bymonth
                if (bymonth.isNullOrEmpty()) {
                    ranges += intArrayOf(0, yearlen)
                } else {
                    for (m in bymonth) mrangeSlice(m)?.let { ranges += it }
                }
            }
            Frequency.MONTHLY -> mrangeSlice(month)?.let { ranges += it }
            else -> Unit
        }
        if (ranges.isEmpty()) {
            nwdaymask = IntArray(0)
            return
        }
        // Weekly frequency never gets here (nth weekdays are dropped above MONTHLY).
        val mask = IntArray(yearlen)
        for (range in ranges) {
            val first = range[0]
            val last = range[1] - 1
            for ((wday, n) in rule.bynweekday.orEmpty()) {
                var i = if (n < 0) last + (n + 1) * 7 else first + (n - 1) * 7
                // Off the mask, rrule.js reads `undefined` and the day never matches.
                if (i !in wdaymask.indices) continue
                i = if (n < 0) i - pymod(wdaymask[i] - wday, 7) else i + pymod(7 - wdaymask[i] + wday, 7)
                if (i in first..last) mask[i] = 1
            }
        }
        nwdaymask = mask
    }

    /**
     * `mrange.slice(month - 1, month + 1)`. An out-of-range BYMONTH yields a
     * range that matches nothing in rrule.js (NaN bounds); here it is skipped.
     */
    private fun mrangeSlice(month: Int): IntArray? =
        if (month in 1..12) intArrayOf(mrange[month - 1], mrange[month]) else null

    private companion object {
        /** 55 repetitions of 0..6 (`WDAYMASK`). */
        const val WDAYMASK_LENGTH = 55 * 7

        val M365RANGE = intArrayOf(0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365)
        val M366RANGE = intArrayOf(0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366)

        fun monthLengths(leap: Boolean) = intArrayOf(31, if (leap) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

        /** Month number of each day, plus 7 days of the next January. */
        fun monthMask(leap: Boolean): IntArray {
            val out = ArrayList<Int>()
            monthLengths(leap).forEachIndexed { index, len -> repeat(len) { out += index + 1 } }
            repeat(7) { out += 1 }
            return out.toIntArray()
        }

        /** Day of month (1-based) of each day, plus 1..7 of the next January. */
        fun monthDayMask(leap: Boolean): IntArray {
            val out = ArrayList<Int>()
            monthLengths(leap).forEach { len -> for (d in 1..len) out += d }
            for (d in 1..7) out += d
            return out.toIntArray()
        }

        /** Negative day of month (-len..-1) of each day, plus -31..-25 of the next January. */
        fun negativeMonthDayMask(leap: Boolean): IntArray {
            val out = ArrayList<Int>()
            monthLengths(leap).forEach { len -> for (d in -len..-1) out += d }
            for (d in -31..-25) out += d
            return out.toIntArray()
        }

        val M365MASK = monthMask(false)
        val M366MASK = monthMask(true)
        val MDAY365MASK = monthDayMask(false)
        val MDAY366MASK = monthDayMask(true)
        val NMDAY365MASK = negativeMonthDayMask(false)
        val NMDAY366MASK = negativeMonthDayMask(true)

        /** rrule.js `easter`: day-of-year index of Easter Sunday + [offset] days. */
        fun easter(y: Int, offset: Int): Int {
            val a = y % 19
            val b = y / 100
            val c = y % 100
            val d = b / 4
            val e = b % 4
            val f = (b + 8) / 25
            val g = (b - f + 1) / 3
            val h = (19 * a + b - d - g + 15) % 30
            val i = c / 4
            val k = c % 4
            val l = (32 + 2 * e + 2 * i - h - k) % 7
            val m = (a + 11 * h + 22 * l) / 451
            val month = (h + l - 7 * m + 114) / 31
            val day = (h + l - 7 * m + 114) % 31 + 1
            val date = UtcCalendar.utcMillis(y, month - 1, day + offset)
            val yearStart = UtcCalendar.utcMillis(y, 0, 1)
            return Math.ceil((date - yearStart) / UtcCalendar.DAY_MS.toDouble()).toInt()
        }
    }
}
