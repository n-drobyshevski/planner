package page.planr.android.feature.insights.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.collapse
import androidx.compose.ui.semantics.expand
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.PreviewSurface

/** A section's title (tab-bits.tsx `SectionLabel`: text-sm, semibold, foreground). */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.semantics { heading() },
        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
        color = MaterialTheme.colorScheme.onSurface,
    )
}

/** The takeaway sentence under a section's title (chart-card.tsx headline). */
@Composable
fun SectionHeadline(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier,
        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
        color = MaterialTheme.colorScheme.onSurface,
    )
}

/** A quiet note under a chart (chart-card.tsx footnote). */
@Composable
fun Footnote(text: String, modifier: Modifier = Modifier) {
    Text(
        rememberGlyphText(text),
        modifier = modifier,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Normal),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/** A flat, hairline-bordered card around a chart, with an optional collapsed table. */
@Composable
fun ChartCard(
    title: String,
    modifier: Modifier = Modifier,
    headline: String? = null,
    footnote: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
    table: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    // Flat at rest (DESIGN.md): the hairline ring carries the edge, never an elevation.
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(PlanrRadii.xl),
        color = PlanrTheme.colors.card,
        contentColor = MaterialTheme.colorScheme.onSurface,
        border = BorderStroke(1.dp, PlanrTheme.colors.hairline),
    ) {
        Column(Modifier.padding(PlanrSpacing.xl), verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                SectionLabel(title, Modifier.weight(1f))
                actions()
            }
            if (headline != null) SectionHeadline(headline)
            content()
            if (footnote != null) Footnote(footnote)
            if (table != null) TableDisclosure(table)
        }
    }
}

/**
 * chart-card.tsx:282-294: "View as table", collapsed by default. The state is
 * exposed through the expand / collapse accessibility actions, which TalkBack
 * announces in the system language.
 */
@Composable
private fun TableDisclosure(table: @Composable () -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    TextButton(
        onClick = { expanded = !expanded },
        modifier = Modifier
            .defaultMinSize(minHeight = PlanrSpacing.touchTarget)
            .semantics {
                if (expanded) {
                    collapse {
                        expanded = false
                        true
                    }
                } else {
                    expand {
                        expanded = true
                        true
                    }
                }
            },
        contentPadding = PaddingValues(horizontal = 6.dp),
    ) {
        Icon(InsightsIcons.Table, contentDescription = null, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(
            stringResource(R.string.insights_common_view_as_table),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    if (expanded) table()
}

@InsightsPreviews
@Composable
private fun ChartCardPreview() = PreviewSurface {
    ChartCard(
        title = "Per day",
        headline = "31h 30m tracked, up 12% vs the previous period.",
        footnote = "Curve: trailing 7-day average · ○ unusual day",
        table = { Text("Work · 12h") },
    ) {
        Spacer(Modifier.size(80.dp))
    }
}
