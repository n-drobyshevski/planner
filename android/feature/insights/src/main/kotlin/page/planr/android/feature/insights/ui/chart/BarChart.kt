package page.planr.android.feature.insights.ui.chart

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp

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
    TODO("U1")
}
