package page.planr.android.core.insights.analytics

import page.planr.android.core.insights.model.Delta

/** trends.ts `delta`: absolute and relative change vs a previous value. */
object DeltaMath {
    /** [Delta.deltaPct] is null when [previous] is 0 (the UI renders "new"). */
    fun delta(current: Double, previous: Double): Delta =
        Delta(current - previous, if (previous == 0.0) null else (current - previous) / previous)

    fun delta(current: Long, previous: Long): Delta = delta(current.toDouble(), previous.toDouble())

    fun delta(current: Int, previous: Int): Delta = delta(current.toDouble(), previous.toDouble())
}
