package page.planr.android.feature.insights.ui.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    TODO("U1")
}

@Composable
fun SectionHeadline(text: String, modifier: Modifier = Modifier) {
    TODO("U1")
}

@Composable
fun Footnote(text: String, modifier: Modifier = Modifier) {
    TODO("U1")
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
    TODO("U1")
}
