package page.planr.android.core.insights.analytics

/** Robust statistics (lib/analytics/stats.ts). */
object Stats {
    /** stats.ts `median` (0.0 for empty; sorts a copy). */
    fun median(values: List<Double>): Double = TODO("A1")

    /** stats.ts `mad`. */
    fun mad(values: List<Double>): Double = TODO("A1")

    /** stats.ts `robustZ`: 0.6745 * (x - med) / mad; null when mad == 0. */
    fun robustZ(value: Double, med: Double, mad: Double): Double? = TODO("A1")

    /** stats.ts `theilSenSlope` over (x, y) points. */
    fun theilSenSlope(points: List<Pair<Double, Double>>): Double? = TODO("A1")
}
