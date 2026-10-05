package page.planr.android.feature.insights.ui.chart

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.COMPARISON_ALPHA
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS

/**
 * Grouped bars with optional line overlays, a reference line and markers. A
 * tap opens the band ([onOpen]) or toggles its tooltip; long-press-drag scrubs.
 * Every band is also its own accessibility node described by [bands].
 */
@Composable
fun BarChart(
    data: BarChartData,
    contentDescription: String,
    bands: List<BandInfo>,
    animationKey: Any,
    modifier: Modifier = Modifier,
    height: Dp = ChartHeights.Standard,
    onOpen: ((Int) -> Unit)? = null,
    openLabel: String? = null,
) {
    val chart = PlanrTheme.colors.chart
    val card = PlanrTheme.colors.card
    val tickColor = MaterialTheme.colorScheme.onSurfaceVariant
    val tickStyle = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR_NUMS)
    val density = LocalDensity.current

    val bandCount = maxOf(data.ticks.size, data.series.maxOfOrNull { it.values.size } ?: 0)
    // Bars first, then the line overlays, as one animated set of values.
    val target = remember(data) {
        data.series.map { s -> DoubleArray(s.values.size) { s.values[it].toDouble() } } +
            data.lines.map { it.values.toDoubleArray() }
    }
    val growth = rememberGrowth(animationKey)
    val values = rememberValueTween(target, animationKey)
    val selection = rememberSelection(animationKey, bandCount, onOpen)

    val measurer = rememberTextMeasurer()
    val tickLabels = remember(data.ticks, tickStyle, measurer) { data.ticks.map { measurer.measure(it, tickStyle) } }
    val nodes = remember(bands, onOpen, openLabel) { ChartA11y.bandNodes(bands, onOpen, openLabel) }

    Box(
        modifier
            .fillMaxWidth()
            .height(height + ChartInsets.TickRow)
            .semantics {
                this.contentDescription = contentDescription
                isTraversalGroup = true
            }
            .onSizeChanged { with(density) { updatePlot(selection, it.width) } }
            .bandGestures(selection),
    ) {
        Spacer(
            Modifier
                .matchParentSize()
                .drawWithCache {
                    val plot = plotRect(size.width, height.toPx())
                    val centers = List(bandCount) { ChartGeometry.bandCenter(it, plot.left, plot.width, bandCount) }
                    val xs = centers.toFloatArray()
                    val ticks = tickIndices(centers, tickLabels)
                    val path = Path()
                    val curve = CurveBuffers(bandCount)
                    val gap = ChartInsets.BarGap.toPx()
                    val radius = ChartInsets.BarRadius.toPx()
                    val reference = chart.comparison.copy(alpha = chart.comparison.alpha * REFERENCE_OPACITY)
                    val dash = dashEffect()
                    val lineStrokes = data.lines.map { style ->
                        val width = if (style.color == chart.line) 1.5.dp.toPx() else 2.dp.toPx()
                        Stroke(width = width, pathEffect = if (style.dashed) dash else null)
                    }
                    val markerRadius = 4.dp.toPx()
                    val markerStroke = Stroke(width = 2.dp.toPx())
                    // Index loops only: this reruns on every animation frame.
                    onDrawBehind {
                        val now = values.current()
                        val g = growth.value
                        val barCount = minOf(data.series.size, now.size)
                        var yMax = 0.0
                        for (k in now.indices) {
                            val arr = now[k]
                            for (j in arr.indices) if (arr[j] > yMax) yMax = arr[j]
                        }
                        drawGrid(plot, chart.grid, yMax > 0.0)
                        if (bandCount == 0) return@onDrawBehind

                        val barWidth = ChartGeometry.barWidth(barCount, plot, gap, bandCount)
                        for (s in 0 until barCount) {
                            val series = now[s]
                            val style = data.series[s]
                            val fill = style.color.copy(alpha = style.color.alpha * style.alpha)
                            for (i in 0 until minOf(bandCount, series.size)) {
                                val v = series[i] * g
                                if (v <= 0.0) continue
                                val left = ChartGeometry.barLeft(i, s, barCount, plot, gap, bandCount)
                                val top = ChartGeometry.yOf(v, yMax, plot)
                                drawTopRoundedBar(path, left, top, left + barWidth, plot.bottom, radius, fill)
                            }
                        }
                        val ref = data.referenceY
                        if (ref != null && ref > 0.0 && ref <= yMax) {
                            val y = ChartGeometry.yOf(ref, yMax, plot)
                            drawLine(reference, Offset(plot.left, y), Offset(plot.right, y), 1.dp.toPx(), pathEffect = dash)
                        }
                        for (l in data.lines.indices) {
                            val line = now.getOrNull(data.series.size + l) ?: break
                            val n = minOf(bandCount, line.size)
                            for (i in 0 until n) curve.ys[i] = ChartGeometry.yOf(line[i] * g, yMax, plot)
                            drawMonotone(path, xs, curve, n, data.lines[l].color, lineStrokes[l])
                        }
                        val primary = if (data.primary in 0 until barCount) now[data.primary] else null
                        if (primary != null) {
                            val ink = data.series[data.primary].color
                            for (i in data.markers) {
                                if (i !in 0 until minOf(bandCount, primary.size)) continue
                                val c = Offset(centers[i], ChartGeometry.yOf(primary[i] * g, yMax, plot))
                                drawCircle(card, markerRadius, c)
                                drawCircle(ink, markerRadius, c, style = markerStroke)
                            }
                        }
                        selection.selected?.let { if (it < bandCount) drawCursor(plot, centers[it], chart.grid) }
                        drawTicks(plot, centers, tickLabels, ticks, tickColor)
                    }
                },
        )
        BandSemantics(nodes)
        BandTooltip(selection, bands)
    }
}

/** The typical-day line's stroke opacity over the comparison color (overview-tab.tsx:451-457). */
private const val REFERENCE_OPACITY = 0.7f

@InsightsPreviews
@Composable
private fun BarChartPreview() = PreviewSurface {
    val chart = PlanrTheme.colors.chart
    BarChart(
        data = BarChartData(
            series = listOf(
                BarSeries("prev", PreviewData.weekPrev, chart.neutral, alpha = COMPARISON_ALPHA),
                BarSeries("ms", PreviewData.week, chart.series[0]),
            ),
            lines = listOf(LineOverlay("avg", PreviewData.week.map { it * 0.8 }, chart.line)),
            referenceY = 4.0 * PreviewData.HOUR,
            markers = setOf(3),
            ticks = PreviewData.weekTicks,
        ),
        contentDescription = "Tracked time per day",
        bands = PreviewData.weekBands,
        animationKey = Unit,
        height = ChartHeights.Compact,
    )
}

@InsightsPreviews
@Composable
private fun BarChartEmptyPreview() = PreviewSurface {
    BarChart(
        data = BarChartData(series = listOf(BarSeries("ms", List(7) { 0L }, Color.Gray)), ticks = PreviewData.weekTicks),
        contentDescription = "Nothing tracked",
        bands = PreviewData.weekBands,
        animationKey = Unit,
    )
}
