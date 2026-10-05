package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** A tab's empty state, under the header inside the tab's list. */
@Composable
fun InsightsEmpty(
    title: String,
    description: String,
    actionLabel: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TODO("U1")
}

/** A section's empty state. */
@Composable
fun SectionEmpty(
    text: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    TODO("U1")
}
