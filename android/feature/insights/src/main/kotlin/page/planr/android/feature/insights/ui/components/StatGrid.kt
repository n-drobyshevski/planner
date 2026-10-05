package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import page.planr.android.core.insights.model.Delta

/** Two columns under 600 dp, three from 600 dp. */
@Composable
fun StatGrid(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    TODO("U1")
}

/** A frameless figure (stat-card.tsx `flat`). */
@Composable
fun StatFigure(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    delta: Delta? = null,
    warning: Boolean = false,
) {
    TODO("U1")
}

/** ▲ / ▼ / – with the change, never colored by direction. */
@Composable
fun DeltaBadge(delta: Delta, modifier: Modifier = Modifier) {
    TODO("U1")
}
