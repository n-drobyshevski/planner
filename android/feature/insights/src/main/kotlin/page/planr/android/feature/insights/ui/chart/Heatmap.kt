package page.planr.android.feature.insights.ui.chart

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/** 7 weekday rows × 6 four-hour bands, tinted in [stepAlpha] steps of [color]. */
@Composable
fun Heatmap(
    data: HeatmapData,
    contentDescription: String,
    color: Color,
    stepOf: (Long) -> Int,
    stepAlpha: FloatArray,
    modifier: Modifier = Modifier,
    onCellTap: ((row: Int, col: Int) -> Unit)? = null,
) {
    TODO("U1")
}

/** The heatmap's scale: 5 swatches with [labels]. */
@Composable
fun HeatmapLegend(labels: List<String>, color: Color, stepAlpha: FloatArray, modifier: Modifier = Modifier) {
    TODO("U1")
}
