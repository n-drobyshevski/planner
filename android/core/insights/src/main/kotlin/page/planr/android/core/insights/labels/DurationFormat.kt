package page.planr.android.core.insights.labels

import page.planr.android.core.insights.js.JsMath

/** lib/datetime/format.ts `formatDuration`: "2h 30m" / "2 ч 30 мин". */
object DurationFormat {
    data class Parts(val hours: Long, val minutes: Int)

    /** Whole minutes, rounded like JS (`Math.round`), never negative. */
    fun parts(ms: Double): Parts {
        val totalMin = maxOf(0L, JsMath.roundToLong(ms / 60_000.0))
        return Parts(hours = totalMin / 60, minutes = (totalMin % 60).toInt())
    }

    /** "0m", "45m", "2h", "2h 30m" (en) / "0 мин", "45 мин", "2 ч", "2 ч 30 мин" (ru). */
    fun format(ms: Double, locale: LabelLocale): String {
        val (h, m) = parts(ms)
        val hu = if (locale == LabelLocale.Ru) " ч" else "h"
        val mu = if (locale == LabelLocale.Ru) " мин" else "m"
        return when {
            h == 0L -> "$m$mu"
            m == 0 -> "$h$hu"
            else -> "$h$hu $m$mu"
        }
    }
}
