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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS

/** Series stacked bottom to top in list order, with separators between segments. */
@Composable
fun StackedBarChart(
    series: List<BarSeries>,
    ticks: List<String>,
    contentDescription: String,
    bands: List<BandInfo>,
    animationKey: Any,
    modifier: Modifier = Modifier,
    height: Dp = ChartHeights.Standard,
) {
    val chart = PlanrTheme.colors.chart
    val card = PlanrTheme.colors.card
    val tickColor = MaterialTheme.colorScheme.onSurfaceVariant
    val tickStyle = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR_NUMS)
    val density = LocalDensity.current

    val bandCount = maxOf(ticks.size, series.maxOfOrNull { it.values.size } ?: 0)
    val target = remember(series) { series.map { s -> DoubleArray(s.values.size) { s.values[it].toDouble() } } }
    val growth = rememberGrowth(animationKey)
    val values = rememberValueTween(target, animationKey)
    val selection = rememberSelection(animationKey, bandCount, onOpen = null)

    val measurer = rememberTextMeasurer()
    val tickLabels = remember(ticks, tickStyle, measurer) { ticks.map { measurer.measure(it, tickStyle) } }
    val nodes = remember(bands) { ChartA11y.bandNodes(bands, onOpen = null, openLabel = null) }

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
                    val tickIdx = tickIndices(centers, tickLabels)
                    val path = Path()
                    val radius = ChartInsets.BarRadius.toPx()
                    val separator = 1.dp.toPx()
                    // Index loops over the (already tweened) values, no boxing: this reruns on every animation frame.
                    onDrawBehind {
                        val now = values.current()
                        val g = growth.value.toDouble()
                        val layers = minOf(now.size, series.size)
                        // Stack Long ms, like ChartGeometry.stacked, so the stacking stays exact.
                        var yMaxMs = 0L
                        for (i in 0 until bandCount) {
                            var total = 0L
                            for (s in 0 until layers) total += msAt(now[s], i)
                            if (total > yMaxMs) yMaxMs = total
                        }
                        val yMax = yMaxMs.toDouble()
                        drawGrid(plot, chart.grid, yMax > 0.0)
                        val width = ChartGeometry.barWidth(1, plot, 0f, bandCount)
                        for (i in 0 until bandCount) {
                            var topLayer = -1
                            for (s in 0 until layers) if (msAt(now[s], i) > 0L) topLayer = s
                            if (topLayer < 0) continue
                            val left = ChartGeometry.barLeft(i, 0, 1, plot, 0f, bandCount)
                            var bottom = 0L
                            for (s in 0..topLayer) {
                                val upper = bottom + msAt(now[s], i)
                                if (upper > bottom) {
                                    val style = series[s]
                                    val fill = style.color.copy(alpha = style.color.alpha * style.alpha)
                                    val yTop = ChartGeometry.yOf(upper * g, yMax, plot)
                                    val yBottom = ChartGeometry.yOf(bottom * g, yMax, plot)
                                    if (s == topLayer) {
                                        drawTopRoundedBar(path, left, yTop, left + width, yBottom, radius, fill)
                                    } else {
                                        drawRect(fill, Offset(left, yTop), Size(width, yBottom - yTop))
                                    }
                                }
                                bottom = upper
                            }
                            // Separators between adjacent segments, over them: the non-color cue between categories.
                            bottom = 0L
                            var below = false // a non-empty segment under this one
                            for (s in 0..topLayer) {
                                val upper = bottom + msAt(now[s], i)
                                if (upper > bottom) {
                                    if (below && bottom > 0L) {
                                        val y = ChartGeometry.yOf(bottom * g, yMax, plot)
                                        drawLine(card, Offset(left, y), Offset(left + width, y), separator)
                                    }
                                    below = true
                                }
                                bottom = upper
                            }
                        }
                        selection.selected?.let { if (it < bandCount) drawCursor(plot, centers[it], chart.grid) }
                        drawTicks(plot, centers, tickLabels, tickIdx, tickColor)
                    }
                },
        )
        BandSemantics(nodes)
        BandTooltip(selection, bands)
    }
}

@InsightsPreviews
@Composable
private fun StackedBarChartPreview() = PreviewSurface {
    val chart = PlanrTheme.colors.chart
    StackedBarChart(
        series = listOf(
            BarSeries("c1", PreviewData.week, Color(0xFF2078B1)),
            BarSeries("c2", PreviewData.weekPrev, Color(0xFF1F8643)),
            BarSeries("__other__", PreviewData.week.map { it / 4 }, chart.neutral),
        ),
        ticks = PreviewData.weekTicks,
        contentDescription = "Stacked tracked time per context per day",
        bands = PreviewData.weekBands,
        animationKey = Unit,
    )
}

/** Column [i] of a tweened series as whole ms (0 past its end). */
private fun msAt(values: DoubleArray, i: Int): Long = if (i < values.size) values[i].toLong() else 0L
