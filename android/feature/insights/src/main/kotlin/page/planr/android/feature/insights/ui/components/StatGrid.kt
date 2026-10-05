package page.planr.android.feature.insights.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.Delta
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.PreviewSurface

/** Two columns under 600 dp, three from 600 dp. */
@Composable
fun StatGrid(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val windowWidth = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
    val columns = if (windowWidth >= WIDE) 3 else 2
    val hGap = 16.dp
    val vGap = 12.dp
    // A grid of equal columns; each row is as tall as its tallest figure.
    Layout(content, modifier) { measurables, constraints ->
        val gapX = hGap.roundToPx()
        val gapY = vGap.roundToPx()
        val width = constraints.maxWidth
        val cell = ((width - gapX * (columns - 1)) / columns).coerceAtLeast(0)
        val placeables = measurables.map { it.measure(Constraints(minWidth = cell, maxWidth = cell)) }
        val rows = placeables.chunked(columns)
        val heights = rows.map { row -> row.maxOf { it.height } }
        val total = heights.sum() + gapY * (rows.size - 1).coerceAtLeast(0)
        layout(width, total) {
            var y = 0
            rows.forEachIndexed { r, row ->
                row.forEachIndexed { c, placeable -> placeable.placeRelative(c * (cell + gapX), y) }
                y += heights[r] + gapY
            }
        }
    }
}

private val WIDE = 600.dp

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
    val prefix = stringResource(R.string.insights_common_needs_attention).trimEnd()
    Column(modifier.semantics(mergeDescendants = true) {}) {
        // The label wraps (stat-card.tsx truncates only the hint): it names the figure.
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (warning) {
                // The triangle is the non-color cue; it also speaks the attention prefix.
                Icon(
                    painterResource(R.drawable.ic_insights_warning),
                    contentDescription = prefix,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(4.dp))
            }
            Text(
                value,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = TABULAR_NUMS),
                color = if (warning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            )
            if (delta != null) {
                Spacer(Modifier.width(6.dp))
                DeltaBadge(delta)
            }
        }
        if (hint != null) {
            Text(
                hint,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** ▲ / ▼ / – with the change, never colored by direction. */
@Composable
fun DeltaBadge(delta: Delta, modifier: Modifier = Modifier) {
    val badge = deltaBadge(delta)
    val text = when (badge.text) {
        DeltaText.None -> ""
        DeltaText.New -> stringResource(R.string.insights_common_delta_new)
        DeltaText.Percent -> "${badge.pct}%"
    }
    val spoken = when (badge.spoken) {
        DeltaSpoken.NoChange -> stringResource(R.string.insights_common_delta_no_change)
        DeltaSpoken.New -> stringResource(R.string.insights_common_delta_new_sr)
        DeltaSpoken.Up -> stringResource(R.string.insights_common_delta_up, badge.pct)
        DeltaSpoken.Down -> stringResource(R.string.insights_common_delta_down, badge.pct)
    }
    Text(
        rememberGlyphText(if (text.isEmpty()) badge.glyph else badge.glyph + " " + text),
        modifier = modifier.clearAndSetSemantics { contentDescription = spoken },
        style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR_NUMS),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

internal enum class DeltaText { None, New, Percent }

internal enum class DeltaSpoken { NoChange, New, Up, Down }

/** stat-card.tsx:14-54, without the strings: the glyph, which text and which spoken line. */
internal data class DeltaBadgeSpec(val glyph: String, val text: DeltaText, val spoken: DeltaSpoken, val pct: Int)

internal fun deltaBadge(delta: Delta): DeltaBadgeSpec {
    val pctOrNull = delta.deltaPct
    if (pctOrNull == null) {
        // A null pct with movement means the previous period was empty: "new".
        return if (delta.delta == 0.0) {
            DeltaBadgeSpec("–", DeltaText.None, DeltaSpoken.NoChange, 0)
        } else {
            DeltaBadgeSpec("▲", DeltaText.New, DeltaSpoken.New, 0)
        }
    }
    val p: Double = pctOrNull
    val pct = JsMath.roundToInt(kotlin.math.abs(p) * 100)
    return when {
        p > 0.0 -> DeltaBadgeSpec("▲", DeltaText.Percent, DeltaSpoken.Up, pct)
        p < 0.0 -> DeltaBadgeSpec("▼", DeltaText.Percent, DeltaSpoken.Down, pct)
        else -> DeltaBadgeSpec("–", DeltaText.Percent, DeltaSpoken.NoChange, pct)
    }
}

@InsightsPreviews
@Composable
private fun StatGridPreview() = PreviewSurface {
    StatGrid {
        StatFigure("Events", "24", hint = "tracked this period", delta = Delta(4.0, 0.2))
        StatFigure("Avg session", "1h 15m", hint = "per tracked event")
        StatFigure("Tasks done", "7", delta = Delta(3.0, null))
        StatFigure("On time", "—", hint = "nothing due", delta = Delta(0.0, null))
        StatFigure("Overdue", "2", hint = "open past their due day", warning = true)
        StatFigure("Busiest day", "6h 30m", hint = "Thu 11 Jun", delta = Delta(-2.0, -0.25))
    }
}

@InsightsPreviews
@Composable
private fun DeltaBadgePreview() = PreviewSurface {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        DeltaBadge(Delta(5.0, 0.124))
        DeltaBadge(Delta(-5.0, -0.5))
        DeltaBadge(Delta(3.0, null))
        DeltaBadge(Delta(0.0, 0.0))
    }
}
