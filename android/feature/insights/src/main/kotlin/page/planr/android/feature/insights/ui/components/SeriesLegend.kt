package page.planr.android.feature.insights.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.PreviewSurface

/** Legend chips; toggleable when [onToggle] is set. Renders only with more than one item. */
@Composable
fun SeriesLegend(
    items: List<LegendItem>,
    modifier: Modifier = Modifier,
    hidden: Set<String> = emptySet(),
    onToggle: ((String) -> Unit)? = null,
) {
    if (items.size <= 1) return
    FlowRow(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(if (onToggle != null) 6.dp else 12.dp),
        verticalArrangement = Arrangement.spacedBy(if (onToggle != null) 0.dp else 6.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        for (item in items) {
            if (onToggle == null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Dot(item.color)
                    Spacer(Modifier.width(6.dp))
                    LegendLabel(item.label, hidden = false)
                }
            } else {
                ToggleChip(item, hidden = item.key in hidden, onToggle = onToggle)
            }
        }
    }
}

/** A toggleable series: strikethrough and faded when hidden, with the state spoken (chart-card.tsx:248-275). */
@Composable
private fun ToggleChip(item: LegendItem, hidden: Boolean, onToggle: (String) -> Unit) {
    val state = stringResource(if (hidden) R.string.insights_common_series_hidden else R.string.insights_common_series_shown)
    FilterChip(
        selected = !hidden,
        onClick = { onToggle(item.key) },
        label = { LegendLabel(item.label, hidden) },
        leadingIcon = { Dot(item.color) },
        modifier = Modifier
            .alpha(if (hidden) HIDDEN_ALPHA else 1f)
            .semantics {
                stateDescription = state
                toggleableState = ToggleableState(!hidden)
            },
    )
}

@Composable
private fun LegendLabel(text: String, hidden: Boolean) {
    Text(
        text,
        modifier = Modifier.widthIn(max = 128.dp),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textDecoration = if (hidden) TextDecoration.LineThrough else null,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun Dot(color: Color) {
    Box(
        Modifier
            .size(8.dp)
            .background(color, CircleShape),
    )
}

private const val HIDDEN_ALPHA = 0.45f

@InsightsPreviews
@Composable
private fun SeriesLegendPreview() = PreviewSurface {
    val items = listOf(
        LegendItem("c1", "Work", Color(0xFF2078B1)),
        LegendItem("c2", "Gym", Color(0xFF1F8643)),
        LegendItem("__other__", "Other", Color(0xFF57514B)),
    )
    Column {
        SeriesLegend(items)
        SeriesLegend(items, hidden = setOf("c2"), onToggle = {})
    }
}
