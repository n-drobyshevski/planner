package page.planr.android.feature.insights.ui.chart

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrTheme

/** A rounded track filled to [fraction] (clamped to 0..1). */
@Composable
fun TrackBar(fraction: Float, color: Color, contentDescription: String, modifier: Modifier = Modifier) {
    // balance-tab.tsx:242-255: `h-1.5 rounded-full bg-muted` with a rounded fill.
    Box(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .semantics { this.contentDescription = contentDescription }
            .clip(CircleShape)
            .background(PlanrTheme.colors.chart.trackStrong),
    ) {
        val filled = fraction.coerceIn(0f, 1f)
        if (filled > 0f) {
            Box(
                Modifier
                    .fillMaxWidth(filled)
                    .fillMaxHeight()
                    .clip(CircleShape)
                    .background(color),
            )
        }
    }
}

@InsightsPreviews
@Composable
private fun TrackBarPreview() = PreviewSurface {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TrackBar(0.8f, Color(0xFF2078B1), "Work: mean satisfaction 3.2 of 4")
        TrackBar(0.35f, PlanrTheme.colors.chart.neutral, "Other: mean satisfaction 1.4 of 4")
    }
}
