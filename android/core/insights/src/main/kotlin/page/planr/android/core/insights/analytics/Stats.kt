package page.planr.android.core.insights.analytics

import kotlin.math.abs

/** Robust statistics (lib/analytics/stats.ts). pearson/spearman come with the Sleep tab. */
object Stats {
    /**
     * JS `(a, b) => a - b`: compares by value only, so -0.0 and 0.0 tie and a
     * stable sort keeps their input order (`sorted()` would put -0.0 first).
     */
    private val numeric = Comparator<Double> { a, b ->
        val x: Double = a
        val y: Double = b
        if (x < y) -1 else if (x > y) 1 else 0
    }

    /** stats.ts `median` (0.0 for empty; sorts a copy). An even count averages the middle pair. */
    fun median(values: List<Double>): Double {
        val n = values.size
        if (n == 0) return 0.0
        val sorted = values.sortedWith(numeric)
        val mid = n / 2
        return if (n % 2 == 1) sorted[mid] else (sorted[mid - 1] + sorted[mid]) / 2
    }

    /** stats.ts `mad`: the unscaled median absolute deviation (0.0 for empty). */
    fun mad(values: List<Double>): Double {
        if (values.isEmpty()) return 0.0
        val med = median(values)
        return median(values.map { abs(it - med) })
    }

    /** stats.ts `robustZ`: 0.6745 * (x - med) / mad; null when mad == 0. */
    fun robustZ(value: Double, med: Double, mad: Double): Double? {
        if (mad == 0.0) return null
        return (0.6745 * (value - med)) / mad
    }

    /**
     * stats.ts `theilSenSlope` over (x, y) points: the median pairwise slope.
     * Null under 3 points or when every x coincides.
     */
    fun theilSenSlope(points: List<Pair<Double, Double>>): Double? {
        if (points.size < 3) return null
        val slopes = ArrayList<Double>(points.size * (points.size - 1) / 2)
        for (i in points.indices) {
            for (j in i + 1 until points.size) {
                val dx = points[j].first - points[i].first
                if (dx == 0.0) continue
                slopes += (points[j].second - points[i].second) / dx
            }
        }
        if (slopes.isEmpty()) return null
        return median(slopes)
    }
}
