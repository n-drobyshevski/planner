package page.planr.android.feature.insights.ui.chart

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrTheme

/** Non-interactive horizontal bars with their values printed (the weekday rhythm). */
@Composable
fun HorizontalBars(
    rows: List<HBarRow>,
    color: Color,
    contentDescription: String,
    animationKey: Any,
    modifier: Modifier = Modifier,
) {
    val valueStyle = PlanrTheme.type.timeMedium
    val growth = rememberGrowth(animationKey)
    val target = remember(rows) { listOf(DoubleArray(rows.size) { rows[it].value }) }
    val values = rememberValueTween(target, animationKey)
    // One value column for every row, as wide as the widest value, so the bars share a scale.
    val measurer = rememberTextMeasurer()
    val valueWidthPx = remember(rows, valueStyle, measurer) {
        rows.maxOfOrNull { measurer.measure(it.valueText, valueStyle).size.width } ?: 0
    }
    val valueWidth = with(LocalDensity.current) { valueWidthPx.toDp() }

    Column(
        modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics {
                this.contentDescription = contentDescription
                isTraversalGroup = true
            },
    ) {
        rows.forEachIndexed { i, row ->
            // Not interactive (30 dp rows, no tooltip): each row is one spoken node, incl. the total.
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(ROW_HEIGHT)
                    .clearAndSetSemantics { this.contentDescription = row.description },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    row.label,
                    modifier = Modifier.width(34.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                )
                Spacer(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .padding(vertical = 6.dp)
                        .drawWithCache {
                            val path = Path()
                            val radius = CornerRadius(3.dp.toPx())
                            onDrawBehind {
                                val now = values.current().firstOrNull() ?: return@onDrawBehind
                                val max = now.maxOrNull() ?: 0.0
                                val v = now.getOrElse(i) { 0.0 } * growth.value
                                if (max <= 0.0 || v <= 0.0) return@onDrawBehind
                                val w = (size.width * (v / max)).toFloat()
                                path.reset()
                                path.addRoundRect(
                                    RoundRect(
                                        left = 0f,
                                        top = 0f,
                                        right = w,
                                        bottom = size.height,
                                        topLeftCornerRadius = CornerRadius.Zero,
                                        topRightCornerRadius = radius,
                                        bottomRightCornerRadius = radius,
                                        bottomLeftCornerRadius = CornerRadius.Zero,
                                    ),
                                )
                                drawPath(path, color)
                            }
                        },
                )
                Spacer(Modifier.width(8.dp))
                Text(row.valueText, modifier = Modifier.width(valueWidth), style = valueStyle, textAlign = TextAlign.End)
            }
        }
    }
}

/** patterns-tab.tsx:138: 7 rows of 30 dp. */
private val ROW_HEIGHT = 30.dp

@InsightsPreviews
@Composable
private fun HorizontalBarsPreview() = PreviewSurface {
    val days = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    val hours = listOf(5.5, 6.25, 4.0, 7.0, 3.5, 1.0, 0.0)
    HorizontalBars(
        rows = days.mapIndexed { i, d ->
            HBarRow(d, hours[i] * 3_600_000, "${hours[i]}h", "$d: ${hours[i]}h avg per day")
        },
        color = PlanrTheme.colors.chart.series[0],
        contentDescription = "Average tracked time per weekday",
        animationKey = Unit,
    )
}
