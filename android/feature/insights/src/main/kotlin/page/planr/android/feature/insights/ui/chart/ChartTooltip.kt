package page.planr.android.feature.insights.ui.chart

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.PlanrTokens

/**
 * The floating tooltip of a band: [title] and its [rows]. The one chart
 * element with a shadow (DESIGN.md: things that genuinely float), like the
 * web's `rounded-xl bg-popover shadow-lg ring-1`. Its text is already spoken
 * by the band's own accessibility node, so the popup itself is silent.
 */
@Composable
fun ChartTooltip(title: String, rows: List<TooltipRow>, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(PlanrRadii.xl)
    val shadow = PlanrTokens.ShadowStone.copy(alpha = SHADOW_ALPHA)
    Surface(
        modifier = modifier
            .widthIn(max = 280.dp)
            .shadow(SHADOW_ELEVATION, shape, ambientColor = shadow, spotColor = shadow)
            .clearAndSetSemantics {},
        shape = shape,
        color = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        border = BorderStroke(1.dp, PlanrTheme.colors.hairline),
    ) {
        Column(
            modifier = Modifier
                .width(IntrinsicSize.Max)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(title, style = MaterialTheme.typography.labelMedium)
            for (row in rows) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    if (row.color != null) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .background(row.color, RoundedCornerShape(2.dp)),
                        )
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        row.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f, fill = true),
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(row.value, style = PlanrTheme.type.timeMedium)
                }
            }
        }
    }
}

private val SHADOW_ELEVATION = 6.dp
private const val SHADOW_ALPHA = 0.3f

@InsightsPreviews
@Composable
private fun ChartTooltipPreview() = PreviewSurface {
    ChartTooltip(
        title = "Wed, 10 Jun",
        rows = listOf(
            TooltipRow(Color(0xFF57534E), "Tracked", "4h 30m"),
            TooltipRow(Color(0xB3292524), "7-day avg", "3h 45m"),
            TooltipRow(null, "Previous period", "2h"),
        ),
        modifier = Modifier.padding(16.dp),
    )
}
