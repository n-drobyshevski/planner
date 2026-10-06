package page.planr.android.feature.inbox.ui

import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.time.Instant

internal enum class AgoUnit { Minutes, Hours, Days }

/** How long ago something happened, in the one unit a "2 hours ago" line names. */
internal data class Ago(val quantity: Int, val unit: AgoUnit) {
    companion object {
        /**
         * Rounded the way the web's `formatDistance` rounds, so both say the
         * same thing: minutes under 45, hours under a day, then days. Never
         * "0 minutes": a row only shows once it is in the past, but the
         * minute tick can make that under a minute.
         */
        fun between(at: Instant, now: Instant): Ago {
            val minutes = ((now - at).inWholeSeconds / 60.0).roundToLong().coerceAtLeast(1)
            return when {
                minutes < 45 -> Ago(minutes.toInt(), AgoUnit.Minutes)
                minutes < 90 -> Ago(1, AgoUnit.Hours)
                minutes < MINUTES_PER_DAY -> Ago((minutes / 60.0).roundToInt(), AgoUnit.Hours)
                minutes < 42 * 60 -> Ago(1, AgoUnit.Days)
                else -> Ago((minutes / MINUTES_PER_DAY.toDouble()).roundToInt(), AgoUnit.Days)
            }
        }

        private const val MINUTES_PER_DAY = 24 * 60
    }
}
