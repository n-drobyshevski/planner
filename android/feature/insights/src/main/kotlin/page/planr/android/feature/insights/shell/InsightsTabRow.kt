package page.planr.android.feature.insights.shell

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.insights.InsightsTab

/**
 * Overview / Trends / Patterns / Tasks / Sleep. Scrollable, because the
 * Russian «Закономерности» does not fit equal columns on a 360 dp phone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun InsightsTabRow(selected: InsightsTab, onSelect: (InsightsTab) -> Unit, modifier: Modifier = Modifier) {
    PrimaryScrollableTabRow(
        selectedTabIndex = selected.ordinal,
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        edgePadding = PlanrSpacing.xl,
    ) {
        InsightsTab.entries.forEach { tab ->
            Tab(
                selected = tab == selected,
                onClick = { onSelect(tab) },
                text = { Text(stringResource(ShellText.tab(tab)), maxLines = 1) },
                unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
