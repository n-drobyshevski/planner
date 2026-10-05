package page.planr.android.feature.insights.patterns

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import page.planr.android.feature.insights.model.PatternsModel
import page.planr.android.feature.insights.model.TabEnv

/** The Patterns tab: a LazyColumn whose first item is always [header]. */
@Composable
fun PatternsTab(
    model: PatternsModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    onOpenAgenda: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TODO("T3")
}
