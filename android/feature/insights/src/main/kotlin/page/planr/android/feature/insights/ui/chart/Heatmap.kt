package page.planr.android.feature.insights.ui.chart

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS

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
    val track = PlanrTheme.colors.chart.track
    val strongEdge = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)
    val labelStyle = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = TABULAR_NUMS)
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val tap by rememberUpdatedState(onCellTap)
    var selected by remember(data) { mutableStateOf<Pair<Int, Int>?>(null) }
    val gap = with(LocalDensity.current) { TOOLTIP_GAP.roundToPx() }
    val cellShape = RoundedCornerShape(2.dp)

    Column(
        modifier
            .fillMaxWidth()
            .semantics {
                this.contentDescription = contentDescription
                isTraversalGroup = true
            },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = ROW_LABEL_WIDTH)
                .clearAndSetSemantics {},
        ) {
            for (label in data.columnLabels) {
                Text(label, Modifier.weight(1f), style = labelStyle, color = labelColor, textAlign = TextAlign.Center)
            }
        }
        Spacer(Modifier.height(4.dp))
        data.rowLabels.forEachIndexed { row, rowLabel ->
            val cells = data.values.getOrElse(row) { emptyList() }
            val summary = remember(data, row) { rowSummary(data, row) }
            // One spoken node per weekday: its non-empty bands.
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(ROW_HEIGHT)
                    .clearAndSetSemantics { this.contentDescription = summary },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(rowLabel, Modifier.width(ROW_LABEL_WIDTH), style = labelStyle, color = labelColor, maxLines = 1)
                cells.forEachIndexed { col, ms ->
                    val step = stepOf(ms).coerceIn(0, stepAlpha.lastIndex)
                    val fill = if (step == 0) track else color.copy(alpha = stepAlpha[step])
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(CELL_SPACING / 2)
                            .background(fill, cellShape)
                            // High-load cells also get an inner edge: distinguishable without hue.
                            .then(if (step >= 3) Modifier.border(1.dp, strongEdge, cellShape) else Modifier)
                            .pointerInput(row, col) {
                                detectTapGestures {
                                    selected = if (selected == row to col) null else row to col
                                    tap?.invoke(row, col)
                                }
                            },
                    ) {
                        if (selected == row to col) {
                            val text = data.cellDescriptions.getOrNull(row)?.getOrNull(col).orEmpty()
                            Popup(
                                popupPositionProvider = remember(gap) { TooltipPosition(null, gap) },
                                properties = PopupProperties(focusable = false),
                            ) {
                                ChartTooltip(text, emptyList())
                            }
                        }
                    }
                }
            }
        }
    }
}

/** A weekday row's spoken text: its non-empty cells' descriptions, or just the weekday. */
private fun rowSummary(data: HeatmapData, row: Int): String {
    val values = data.values.getOrElse(row) { emptyList() }
    val descriptions = data.cellDescriptions.getOrElse(row) { emptyList() }
    val busy = descriptions.filterIndexed { col, _ -> values.getOrElse(col) { 0L } > 0L }
    return if (busy.isEmpty()) data.rowLabels[row] else busy.joinToString(", ")
}

/** The heatmap's scale: 5 swatches with [labels]. */
@Composable
fun HeatmapLegend(labels: List<String>, color: Color, stepAlpha: FloatArray, modifier: Modifier = Modifier) {
    val track = PlanrTheme.colors.chart.track
    Row(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        labels.forEachIndexed { step, label ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                val fill = if (step == 0) track else color.copy(alpha = stepAlpha.getOrElse(step) { 1f })
                Box(
                    Modifier
                        .size(10.dp)
                        .background(fill, RoundedCornerShape(2.dp)),
                )
                Spacer(Modifier.width(4.dp))
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private val ROW_HEIGHT = 24.dp
private val ROW_LABEL_WIDTH = 32.dp
private val CELL_SPACING = 1.dp

@InsightsPreviews
@Composable
private fun HeatmapPreview() = PreviewSurface {
    val alpha = floatArrayOf(0f, 0.25f, 0.45f, 0.70f, 1f)
    val step = { ms: Long ->
        when {
            ms <= 0 -> 0
            ms < 30 * 60_000 -> 1
            ms < 60 * 60_000 -> 2
            ms < 120 * 60_000 -> 3
            else -> 4
        }
    }
    val days = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    val values = List(7) { r -> List(6) { c -> ((r * 7 + c * 13) % 9) * 15 * 60_000L } }
    Column {
        Heatmap(
            data = HeatmapData(
                rowLabels = days,
                columnLabels = listOf("0–4", "4–8", "8–12", "12–16", "16–20", "20–24"),
                values = values,
                cellDescriptions = List(7) { r -> List(6) { c -> "${days[r]} ${c * 4}:00–${c * 4 + 4}:00" } },
            ),
            contentDescription = "Tracked time by weekday in 4-hour bands",
            color = PlanrTheme.colors.chart.series[0],
            stepOf = step,
            stepAlpha = alpha,
        )
        Spacer(Modifier.height(8.dp))
        HeatmapLegend(listOf("0", "<30m", "<1h", "<2h", "2h+"), PlanrTheme.colors.chart.series[0], alpha)
    }
}
