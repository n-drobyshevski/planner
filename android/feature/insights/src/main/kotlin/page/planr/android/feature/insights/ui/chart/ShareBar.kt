package page.planr.android.feature.insights.ui.chart

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrTheme

/** A decorative 100% bar of [segments]; the list beside it carries the data. */
@Composable
fun ShareBar(segments: List<ShareSegment>, modifier: Modifier = Modifier) {
    val track = PlanrTheme.colors.chart.trackStrong
    Canvas(
        modifier
            .fillMaxWidth()
            .height(10.dp)
            .clearAndSetSemantics {},
    ) {
        val radius = CornerRadius(size.height / 2f)
        val outline = Path().apply { addRoundRect(RoundRect(0f, 0f, size.width, size.height, radius)) }
        drawRoundRect(track, cornerRadius = radius)
        val drawn = segments.filter { it.weight > 0 }
        val total = drawn.sumOf { it.weight }
        if (total <= 0) return@Canvas
        // overview-tab.tsx:446-460: widths ∝ weight with a 2 dp gap, never under 1 px.
        val gap = 2.dp.toPx()
        val available = maxOf(0f, size.width - gap * (drawn.size - 1))
        clipPath(outline) {
            var x = 0f
            for (segment in drawn) {
                val w = maxOf(1f, available * segment.weight.toFloat() / total.toFloat())
                drawRect(segment.color, Offset(x, 0f), Size(w, size.height))
                x += w + gap
            }
        }
    }
}

@InsightsPreviews
@Composable
private fun ShareBarPreview() = PreviewSurface {
    ShareBar(
        listOf(
            ShareSegment("c1", 5, Color(0xFF2078B1)),
            ShareSegment("c2", 3, Color(0xFF1F8643)),
            ShareSegment("c3", 1, Color(0xFFD02F6B)),
            ShareSegment("other", 1, PlanrTheme.colors.chart.neutral),
        ),
    )
}
