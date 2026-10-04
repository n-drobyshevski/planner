package page.planr.android.core.recurrence.rrule

/**
 * The few JavaScript `Date` / rrule.js `dateutil` primitives the port needs,
 * on plain epoch milliseconds read as UTC fields (rrule.js only ever uses the
 * UTC getters, so its "dates" are wall-clock values in a UTC frame).
 */
internal object UtcCalendar {
    const val DAY_MS = 86_400_000L
    const val MAXYEAR = 9999

    fun isLeapYear(year: Int): Boolean = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

    fun daysInMonth(year: Int, month: Int): Int = when (month) {
        2 -> if (isLeapYear(year)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }

    /** Days since 1970-01-01 of a proleptic Gregorian date (`toOrdinal` in rrule.js). */
    fun epochDay(year: Int, month: Int, day: Int): Long {
        // Howard Hinnant's days_from_civil.
        val y = if (month <= 2) year - 1 else year
        val era = Math.floorDiv(y, 400)
        val yoe = y - era * 400
        val mp = (month + 9) % 12
        val doy = (153 * mp + 2) / 5 + day - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097L + doe - 719_468L
    }

    /** `Date.UTC(year, month0, day, h, mi, s)`, including its field overflow. */
    fun utcMillis(year: Int, month0: Int, day: Int, hour: Int = 0, minute: Int = 0, second: Int = 0, ms: Int = 0): Long {
        val y = year + Math.floorDiv(month0, 12)
        val m = Math.floorMod(month0, 12) + 1
        val days = epochDay(y, m, 1) + (day - 1)
        return days * DAY_MS + hour * 3_600_000L + minute * 60_000L + second * 1_000L + ms
    }

    /** Python weekday (0 = Monday) of an epoch day. */
    fun weekdayOfEpochDay(epochDay: Long): Int = Math.floorMod(epochDay + 3, 7L).toInt()

    /** Python weekday (0 = Monday) of an epoch-ms instant's UTC date. */
    fun weekdayOf(ms: Long): Int = weekdayOfEpochDay(Math.floorDiv(ms, DAY_MS))

    /** UTC calendar fields of [ms]. */
    data class Fields(
        val year: Int, val month: Int, val day: Int,
        val hour: Int, val minute: Int, val second: Int, val millisecond: Int,
    )

    fun fields(ms: Long): Fields {
        val days = Math.floorDiv(ms, DAY_MS)
        val msOfDay = Math.floorMod(ms, DAY_MS).toInt()
        // Howard Hinnant's civil_from_days.
        val z = days + 719_468L
        val era = Math.floorDiv(z, 146_097L)
        val doe = (z - era * 146_097L).toInt()
        val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val day = doy - (153 * mp + 2) / 5 + 1
        val month = if (mp < 10) mp + 3 else mp - 9
        val year = (yoe + era * 400).toInt() + if (month <= 2) 1 else 0
        return Fields(
            year, month, day,
            msOfDay / 3_600_000, msOfDay / 60_000 % 60, msOfDay / 1_000 % 60, msOfDay % 1_000,
        )
    }

    /** rrule.js `timeToUntilString`: `YYYYMMDDTHHMMSS` plus `Z` when [utc]. */
    fun toUntilString(ms: Long, utc: Boolean = true): String {
        val f = fields(ms)
        return buildString {
            append(f.year.toString().padStart(4, '0'))
            append(pad2(f.month)).append(pad2(f.day)).append('T')
            append(pad2(f.hour)).append(pad2(f.minute)).append(pad2(f.second))
            if (utc) append('Z')
        }
    }

    private val UNTIL_PATTERN = Regex("""^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})Z?)?$""")

    /** rrule.js `untilStringToDate`: basic-form date or date-time, always read as UTC. */
    fun parseUntilString(text: String): Long {
        val m = UNTIL_PATTERN.find(text) ?: throw IllegalArgumentException("Invalid UNTIL value: $text")
        val g = m.groupValues
        return utcMillis(
            g[1].toInt(), g[2].toInt() - 1, g[3].toInt(),
            g[5].toIntOrNull() ?: 0, g[6].toIntOrNull() ?: 0, g[7].toIntOrNull() ?: 0,
        )
    }

    fun pad2(n: Int): String = if (n in 0..9) "0$n" else n.toString()

    /** Python-style modulo (result takes the divisor's sign), rrule.js `pymod`. */
    fun pymod(a: Int, b: Int): Int = Math.floorMod(a, b)
}
