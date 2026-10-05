package page.planr.android.feature.insights.ui.chart

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp

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
    TODO("U1")
}
