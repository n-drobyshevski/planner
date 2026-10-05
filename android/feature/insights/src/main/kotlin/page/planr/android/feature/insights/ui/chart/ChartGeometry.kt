package page.planr.android.feature.insights.ui.chart

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.sign

/**
 * The pure geometry of the Insights charts: the Y domain, band hit-testing,
 * bar rectangles, sparse tick labels, monotone curves and stacking. No drawing
 * here, so every rule is unit-tested on the JVM (ChartGeometryTest).
 *
 * Bands are the category slots of a Recharts category axis: band `i` spans
 * `[plot.left + i·bw, plot.left + (i+1)·bw)` with `bw = plot.width / n`, and
 * lines pass through the band centers.
 */
object ChartGeometry {

    /** Recharts' default `barCategoryGap` (10% on each side), so a band's group takes 80%. */
    const val GROUP_FRACTION = 0.8f

    /** The top of the Y domain `[0, yMax]`: the largest drawn value, 0.0 when there is none. */
    fun yMax(vararg series: List<Number>?): Double {
        var max = 0.0
        for (values in series) {
            if (values == null) continue
            for (v in values) {
                val d = v.toDouble()
                if (d > max) max = d
            }
        }
        return max
    }

    /** The band under [x], or null outside the plot (or with no bands). */
    fun bandOf(x: Float, plotLeft: Float, plotWidth: Float, n: Int): Int? {
        if (n <= 0 || plotWidth <= 0f || x < plotLeft || x >= plotLeft + plotWidth) return null
        return floor((x - plotLeft) / plotWidth * n).toInt().coerceIn(0, n - 1)
    }

    /** The center x of band [index]. */
    fun bandCenter(index: Int, plotLeft: Float, plotWidth: Float, n: Int): Float =
        plotLeft + (index + 0.5f) * plotWidth / n

    /**
     * Bar [seriesIndex] of [seriesCount] in band [index] of [bandCount]: the
     * group takes [GROUP_FRACTION] of the band, its bars split it evenly with
     * [gapPx] between them, and the height is `value / yMax` of the plot (0
     * when `yMax <= 0`), standing on the plot's bottom.
     */
    fun barRect(
        index: Int,
        seriesIndex: Int,
        seriesCount: Int,
        value: Double,
        yMax: Double,
        plot: Rect,
        gapPx: Float,
        bandCount: Int,
    ): Rect {
        val left = barLeft(index, seriesIndex, seriesCount, plot, gapPx, bandCount)
        return Rect(left, yOf(value, yMax, plot), left + barWidth(seriesCount, plot, gapPx, bandCount), plot.bottom)
    }

    /** The left edge of [barRect], without allocating it (for the draw loop). */
    fun barLeft(index: Int, seriesIndex: Int, seriesCount: Int, plot: Rect, gapPx: Float, bandCount: Int): Float {
        val bw = plot.width / maxOf(1, bandCount)
        val groupLeft = plot.left + index * bw + (bw - bw * GROUP_FRACTION) / 2f
        return groupLeft + seriesIndex * (barWidth(seriesCount, plot, gapPx, bandCount) + gapPx)
    }

    /** The width of every bar of [barRect]. */
    fun barWidth(seriesCount: Int, plot: Rect, gapPx: Float, bandCount: Int): Float {
        val group = plot.width / maxOf(1, bandCount) * GROUP_FRACTION
        val count = maxOf(1, seriesCount)
        return maxOf(0f, (group - gapPx * (count - 1)) / count)
    }

    /** The plot y of [value] on `[0, yMax]` (the bottom when `yMax <= 0`). */
    fun yOf(value: Double, yMax: Double, plot: Rect): Float {
        if (yMax <= 0.0) return plot.bottom
        val fraction = (value / yMax).coerceIn(0.0, 1.0).toFloat()
        return plot.bottom - fraction * plot.height
    }

    /**
     * Which tick labels to draw (Recharts `preserveStartEnd` with a `minTickGap`):
     * always the first and the last; interior labels greedily left to right
     * when they clear the previous kept label by [minGapPx]; then interior
     * labels that would collide with the last one are dropped from the end.
     * Label `i` spans `centers[i] ± labelWidths[i] / 2`.
     */
    fun sparseTickIndices(centers: List<Float>, labelWidths: List<Float>, minGapPx: Float): List<Int> {
        val n = min(centers.size, labelWidths.size)
        if (n == 0) return emptyList()
        if (n == 1) return listOf(0)
        fun left(i: Int) = centers[i] - labelWidths[i] / 2f
        fun right(i: Int) = centers[i] + labelWidths[i] / 2f

        val kept = ArrayList<Int>()
        kept += 0
        for (i in 1 until n - 1) {
            if (left(i) >= right(kept.last()) + minGapPx) kept += i
        }
        while (kept.size > 1 && right(kept.last()) + minGapPx > left(n - 1)) kept.removeAt(kept.lastIndex)
        kept += n - 1
        return kept
    }

    /**
     * d3 `curveMonotoneX` (Fritsch–Carlson) through [points] (x increasing):
     * the cubic segments as control-point triples `(c1, c2, end)`, one per
     * segment, to follow a move to `points[0]`. Two points make a straight
     * segment; fewer make none. A monotone run of points never overshoots.
     */
    fun monotonePath(points: List<Offset>): List<Offset> {
        val n = points.size
        if (n < 2) return emptyList()
        val xs = FloatArray(n) { points[it].x }
        val ys = FloatArray(n) { points[it].y }
        val out = FloatArray(6 * (n - 1))
        val segments = monotoneInto(xs, ys, n, FloatArray(n), out)
        return List(3 * segments) { Offset(out[2 * it], out[2 * it + 1]) }
    }

    /**
     * [monotonePath] without allocating, for the draw loop: the curve through
     * the first [n] points of [xs] / [ys], written to [out] as 6 floats per
     * segment (`c1x c1y c2x c2y endX endY`), with [tangents] (≥ n) as scratch.
     * Returns the number of segments.
     */
    fun monotoneInto(xs: FloatArray, ys: FloatArray, n: Int, tangents: FloatArray, out: FloatArray): Int {
        if (n < 2) return 0
        if (n == 2) {
            val dx = xs[1] - xs[0]
            val dy = ys[1] - ys[0]
            out[0] = xs[0] + dx / 3f
            out[1] = ys[0] + dy / 3f
            out[2] = xs[0] + dx * 2f / 3f
            out[3] = ys[0] + dy * 2f / 3f
            out[4] = xs[1]
            out[5] = ys[1]
            return 1
        }
        for (i in 1 until n - 1) tangents[i] = slope3(xs[i - 1], ys[i - 1], xs[i], ys[i], xs[i + 1], ys[i + 1])
        tangents[0] = slope2(xs[0], ys[0], xs[1], ys[1], tangents[1])
        tangents[n - 1] = slope2(xs[n - 2], ys[n - 2], xs[n - 1], ys[n - 1], tangents[n - 2])

        for (i in 0 until n - 1) {
            val dx = (xs[i + 1] - xs[i]) / 3f
            val o = 6 * i
            out[o] = xs[i] + dx
            out[o + 1] = ys[i] + dx * tangents[i]
            out[o + 2] = xs[i + 1] - dx
            out[o + 3] = ys[i + 1] - dx * tangents[i + 1]
            out[o + 4] = xs[i + 1]
            out[o + 5] = ys[i + 1]
        }
        return n - 1
    }

    /** d3's interior tangent: 0 at a local extremum, else the limited harmonic slope. */
    private fun slope3(x0: Float, y0: Float, x1: Float, y1: Float, x2: Float, y2: Float): Float {
        val h0 = x1 - x0
        val h1 = x2 - x1
        if (h0 == 0f || h1 == 0f) return 0f
        val s0 = (y1 - y0) / h0
        val s1 = (y2 - y1) / h1
        val p = (s0 * h1 + s1 * h0) / (h0 + h1)
        val t = (sign(s0) + sign(s1)) * minOf(abs(s0), abs(s1), 0.5f * abs(p))
        return if (t.isNaN()) 0f else t
    }

    /** d3's end tangent from the neighbouring one. */
    private fun slope2(x0: Float, y0: Float, x1: Float, y1: Float, t: Float): Float {
        val h = x1 - x0
        return if (h != 0f) (3f * (y1 - y0) / h - t) / 2f else t
    }

    /**
     * Stacks [values] (`[series][column]`, bottom to top in series order) into
     * `[column][series]` ranges `bottom to top`; a zero value is an empty range
     * at the running top. Missing values count as 0.
     */
    fun stacked(values: List<List<Long>>): List<List<Pair<Long, Long>>> {
        val columns = values.maxOfOrNull { it.size } ?: 0
        return List(columns) { col ->
            var top = 0L
            values.map { series ->
                val bottom = top
                top += series.getOrElse(col) { 0L }
                bottom to top
            }
        }
    }
}
