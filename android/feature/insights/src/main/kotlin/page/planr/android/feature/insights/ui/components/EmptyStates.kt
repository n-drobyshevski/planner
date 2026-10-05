package page.planr.android.feature.insights.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.PreviewSurface

/** A tab's empty state, under the header inside the tab's list. */
@Composable
fun InsightsEmpty(
    title: String,
    description: String,
    actionLabel: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Not fillMaxSize: it is an item of the tab's list, below the period bar.
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = PlanrSpacing.xl, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            painterResource(R.drawable.ic_insights_info),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(bottom = PlanrSpacing.xs)
                .size(32.dp),
        )
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Text(
            description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        OutlinedButton(onClick = onAction, modifier = Modifier.padding(top = PlanrSpacing.md)) {
            Text(actionLabel)
        }
    }
}

/** A section's empty state. */
@Composable
fun SectionEmpty(
    text: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val border = MaterialTheme.colorScheme.outlineVariant
    Box(
        modifier
            .fillMaxWidth()
            .drawBehind {
                val stroke = 1.dp.toPx()
                val dash = 4.dp.toPx()
                drawRoundRect(
                    color = border,
                    topLeft = Offset(stroke / 2, stroke / 2),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = CornerRadius(PlanrRadii.lg.toPx()),
                    style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash, dash))),
                )
            }
            .padding(PlanrSpacing.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
            Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (actionLabel != null && onAction != null) {
                TextButton(onClick = onAction) { Text(actionLabel) }
            }
        }
    }
}

@InsightsPreviews
@Composable
private fun EmptyStatesPreview() = PreviewSurface {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        InsightsEmpty(
            title = "No tracked time in this period",
            description = "Insights count timed events from your calendar.",
            actionLabel = "Open the calendar",
            onAction = {},
        )
        SectionEmpty(
            text = "Set focus, energy or satisfaction on events to unlock attribute patterns.",
            actionLabel = "Open the calendar",
            onAction = {},
        )
    }
}
