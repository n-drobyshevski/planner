package page.planr.android.core.insights.labels

/** lib/datetime/format.ts `formatDuration`: "2h 30m" / "2 ч 30 мин". */
object DurationFormat {
    data class Parts(val hours: Long, val minutes: Int)

    /** Whole minutes, rounded like JS (`Math.round`), never negative. */
    fun parts(ms: Double): Parts = TODO("A3")

    fun format(ms: Double, locale: LabelLocale): String = TODO("A3")
}
