package page.planr.android.feature.insights.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.feature.insights.FilterCategory
import page.planr.android.feature.insights.FiltersUi
import page.planr.android.feature.insights.R

/**
 * What the numbers count (insights-filters-popover.tsx): one checkbox per
 * category (checked = counted) and "Include inactive blocks". Changes apply
 * at once; there is no Apply button, as on the web.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FiltersSheet(
    filters: FiltersUi,
    onCategoryHidden: (id: String, hidden: Boolean) -> Unit,
    onIncludeInactive: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PlanrTheme.colors.card,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = PlanrSpacing.xl)
                .padding(bottom = PlanrSpacing.xl)
                .navigationBarsPadding(),
        ) {
            Text(
                stringResource(R.string.insights_filters_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                stringResource(R.string.insights_filters_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = PlanrSpacing.xs),
            )
            if (filters.categories.isNotEmpty()) {
                Text(
                    stringResource(R.string.insights_filters_categories),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(top = PlanrSpacing.xl, bottom = PlanrSpacing.xs)
                        .semantics { heading() },
                )
                filters.categories.forEach { category ->
                    CategoryRow(category, onToggle = { counted -> onCategoryHidden(category.id, !counted) })
                }
            }
            HorizontalDivider(Modifier.padding(vertical = PlanrSpacing.md), color = PlanrTheme.colors.hairline)
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .toggleable(value = filters.includeInactive, role = Role.Switch, onValueChange = onIncludeInactive),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.insights_filters_include_inactive), style = MaterialTheme.typography.bodyMedium)
                    Text(
                        stringResource(R.string.insights_filters_include_inactive_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = filters.includeInactive, onCheckedChange = null)
            }
        }
    }
}

/** A category row: color dot, name, checkbox (checked = counted). The whole row toggles. */
@Composable
private fun CategoryRow(category: FilterCategory, onToggle: (counted: Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = !category.hidden, role = Role.Checkbox, onValueChange = onToggle),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        Box(
            Modifier
                .size(10.dp)
                .background(categoryInk(category.color), CircleShape),
        )
        Text(
            category.name,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Checkbox(checked = !category.hidden, onCheckedChange = null)
    }
}

/** The category's swatch, lightened on dark surfaces (the agenda's ink rule). */
@Composable
private fun categoryInk(hex: String): Color {
    val colors = PlanrTheme.colors
    val base = parseHexColor(hex, colors.chart.neutral)
    return if (colors.isDark) lerp(base, Color.White, 0.42f) else base
}
