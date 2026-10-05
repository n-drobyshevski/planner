package page.planr.android.feature.insights.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.core.insights.model.LedeTone
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.chart.InsightsPreviews
import page.planr.android.feature.insights.ui.chart.PreviewSurface

/** A tab's answer sentence with its support line and lead figures (insight-lede.tsx). */
@Composable
fun LedeRow(
    tone: LedeTone,
    headline: String,
    support: String?,
    figures: List<LeadFigure>,
    modifier: Modifier = Modifier,
) {
    val attention = tone == LedeTone.Attention
    val prefix = stringResource(R.string.insights_common_needs_attention)
    // No card: the answer sits on the paper. Tone is the icon's shape, its tint and the spoken prefix.
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
        Icon(
            painterResource(if (attention) R.drawable.ic_insights_attention else R.drawable.ic_insights_info),
            contentDescription = null,
            tint = if (attention) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = 3.dp)
                .size(16.dp),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    headline,
                    modifier = if (attention) Modifier.semantics { contentDescription = prefix + headline } else Modifier,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (support != null) {
                    Text(support, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (figures.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(24.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for (figure in figures) LeadFigureView(figure)
                }
            }
        }
    }
}

/** tab-bits.tsx `LeadFigures`: label over a tabular value, an optional hint. */
@Composable
private fun LeadFigureView(figure: LeadFigure) {
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Text(figure.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            figure.value,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = TABULAR_NUMS),
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (figure.hint != null) {
            Text(figure.hint, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@InsightsPreviews
@Composable
private fun LedeRowPreview() = PreviewSurface {
    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        LedeRow(
            tone = LedeTone.Neutral,
            headline = "You tracked 31h 30m, up 12% (3h 20m) vs the previous week.",
            support = "Most of it went to Work (48%).",
            figures = listOf(
                LeadFigure("Total", "31h 30m"),
                LeadFigure("Daily avg", "4h 30m"),
                LeadFigure("Active days", "6/7"),
            ),
        )
        LedeRow(
            tone = LedeTone.Attention,
            headline = "2 tasks are overdue and still open.",
            support = "You finished 5 tasks in this period.",
            figures = listOf(LeadFigure("On time", "80%", "of 5 due")),
        )
    }
}
