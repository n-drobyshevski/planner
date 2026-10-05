package page.planr.android.core.recurrence.rrule

/**
 * rrule.js `Frequency`. The ordinal order is load-bearing: rrule.js compares
 * frequencies numerically (`freq > MONTHLY`, `freq < HOURLY`).
 */
internal enum class Frequency {
    YEARLY, MONTHLY, WEEKLY, DAILY, HOURLY, MINUTELY, SECONDLY;

    /** rrule.js `freqIsDailyOrGreater`: DAILY and coarser. */
    val isDailyOrGreater: Boolean get() = this < HOURLY
}

/**
 * rrule.js `Weekday`: [weekday] is 0 = MO … 6 = SU (Python-style); [n] is the
 * optional ordinal of an `nth` weekday (`-1FR`, `+2TU`).
 */
internal data class Weekday(val weekday: Int, val n: Int? = null) {
    init {
        require(weekday in 0..6) { "Invalid weekday index: $weekday" }
        require(n != 0) { "Can't create weekday with n == 0" }
    }

    /** `MO`, or `+2TU` / `-1FR` (rrule.js always signs a positive n). */
    override fun toString(): String {
        val code = CODES[weekday]
        return if (n == null) code else (if (n > 0) "+" else "") + n + code
    }

    companion object {
        val CODES = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")

        fun fromCode(code: String): Weekday? = CODES.indexOf(code).takeIf { it >= 0 }?.let(::Weekday)
    }
}
