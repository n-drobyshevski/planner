package page.planr.android.feature.insights.overview

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import page.planr.android.feature.insights.model.OverviewModel
import page.planr.android.feature.insights.model.TabEnv

/** The Overview tab: a LazyColumn whose first item is always [header]. */
@Composable
fun OverviewTab(
    model: OverviewModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    showComparison: Boolean,
    onToggleComparison: () -> Unit,
    onOpenDay: (Long) -> Unit,
    onOpenAgenda: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TODO("T1")
}
