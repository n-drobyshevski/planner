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

/** Monotone lines through the band centers; [hidden] series are not drawn. Tap / scrub tooltips. */
@Composable
fun LineChart(
    series: List<LineSeries>,
    hidden: Set<String>,
    ticks: List<String>,
    contentDescription: String,
    bands: List<BandInfo>,
    animationKey: Any,
    modifier: Modifier = Modifier,
    height: Dp = ChartHeights.Standard,
) {
    val chart = PlanrTheme.colors.chart
    val tickColor = MaterialTheme.colorScheme.onSurfaceVariant
    val tickStyle = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR_NUMS)
    val density = LocalDensity.current

    val visible = remember(series, hidden) { series.filter { it.key !in hidden } }
    val bandCount = maxOf(ticks.size, series.maxOfOrNull { it.values.size } ?: 0)
    val target = remember(visible) { visible.map { s -> DoubleArray(s.values.size) { s.values[it].toDouble() } } }
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
                    val stroke = 2.dp.toPx()
                    onDrawBehind {
                        val now = values.current()
                        val g = growth.value
                        // yMax over the visible series only.
                        val yMax = now.maxOfOrNull { arr -> arr.maxOrNull() ?: 0.0 }?.coerceAtLeast(0.0) ?: 0.0
                        drawGrid(plot, chart.grid, yMax > 0.0)
                        now.forEachIndexed { s, line ->
                            if (s >= visible.size) return@forEachIndexed
                            val points = List(minOf(bandCount, line.size)) { i ->
                                Offset(centers[i], ChartGeometry.yOf(line[i] * g, yMax, plot))
                            }
                            drawMonotone(path, points, visible[s].color, stroke)
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
private fun LineChartPreview() = PreviewSurface {
    val chart = PlanrTheme.colors.chart
    LineChart(
        series = listOf(
            LineSeries("c1", "Work", PreviewData.week, Color(0xFF2078B1)),
            LineSeries("c2", "Gym", PreviewData.weekPrev, Color(0xFF1F8643)),
            LineSeries("__other__", "Other", PreviewData.week.map { it / 3 }, chart.neutral),
        ),
        hidden = setOf("c2"),
        ticks = PreviewData.weekTicks,
        contentDescription = "Tracked time per context per day",
        bands = PreviewData.weekBands,
        animationKey = Unit,
    )
}
