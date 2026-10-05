package page.planr.android.feature.insights.ui.chart

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp

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
    TODO("U1")
}
