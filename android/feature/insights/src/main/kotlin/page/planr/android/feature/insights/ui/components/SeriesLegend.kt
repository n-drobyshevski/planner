package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Legend chips; toggleable when [onToggle] is set. Renders only with more than one item. */
@Composable
fun SeriesLegend(
    items: List<LegendItem>,
    modifier: Modifier = Modifier,
    hidden: Set<String> = emptySet(),
    onToggle: ((String) -> Unit)? = null,
) {
    TODO("U1")
}
