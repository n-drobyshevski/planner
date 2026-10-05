package page.planr.android.feature.insights.trends

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import page.planr.android.feature.insights.model.TrendsModel
import page.planr.android.feature.insights.model.TabEnv

/** The Trends tab: a LazyColumn whose first item is always [header]. */
@Composable
fun TrendsTab(
    model: TrendsModel,
    env: TabEnv,
    header: @Composable () -> Unit,
    hiddenSeries: Set<String>,
    onToggleSeries: (String) -> Unit,
    onOpenDay: (Long) -> Unit,
    onOpenAgenda: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TODO("T2")
}
