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
import androidx.compose.ui.geometry.Rect
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
                    onDrawBehind {
                        val now = values.current()
                        val g = growth.value.toDouble()
                        // Stack the (already tweened) values; Long ms keep the stacking exact.
                        val columns = ChartGeometry.stacked(now.map { arr -> arr.map { it.toLong() } })
                        val yMax = columns.maxOfOrNull { col -> col.lastOrNull()?.second ?: 0L }?.toDouble() ?: 0.0
                        drawGrid(plot, chart.grid, yMax > 0.0)
                        for (i in 0 until minOf(bandCount, columns.size)) {
                            val column = columns[i]
                            val top = column.indexOfLast { (bottom, top) -> top > bottom }
                            if (top < 0) continue
                            val frame = ChartGeometry.barRect(i, 0, 1, 0.0, yMax, plot, 0f, bandCount)
                            column.forEachIndexed { s, (bottom, upper) ->
                                if (upper <= bottom) return@forEachIndexed
                                val rect = Rect(
                                    frame.left,
                                    ChartGeometry.yOf(upper * g, yMax, plot),
                                    frame.right,
                                    ChartGeometry.yOf(bottom * g, yMax, plot),
                                )
                                val style = series[s]
                                val fill = style.color.copy(alpha = style.color.alpha * style.alpha)
                                if (s == top) {
                                    drawTopRoundedBar(path, rect, radius, fill)
                                } else {
                                    drawRect(fill, rect.topLeft, rect.size)
                                }
                            }
                            // Separators between adjacent segments: the non-color cue between categories.
                            column.forEachIndexed { s, (bottom, upper) ->
                                if (upper <= bottom || bottom <= 0L) return@forEachIndexed
                                if (column.subList(0, s).none { (b, t) -> t > b }) return@forEachIndexed
                                val y = ChartGeometry.yOf(bottom * g, yMax, plot)
                                drawLine(card, Offset(frame.left, y), Offset(frame.right, y), separator)
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
