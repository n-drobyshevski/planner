package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.model.Category
import page.planr.android.feature.insights.R

/** A series key's color (series.ts `seriesMeta`): the category's, or the neutral for Other / No context / unknown. */
@Composable
fun seriesColor(seriesKey: String, categories: Map<String, Category>): Color {
    val colors = PlanrTheme.colors
    val neutral = colors.chart.neutral
    if (seriesKey == SeriesKeys.OTHER || seriesKey == SeriesKeys.UNCATEGORIZED) return neutral
    val category = categories[seriesKey] ?: return neutral
    val base = parseHexColor(category.color, neutral)
    // The agenda's ink rule (BlockStyle.kt): lifted toward white so marks keep ≥ 3:1 on the dark card.
    return if (colors.isDark) lerp(base, Color.White, DARK_LIFT) else base
}

/** A series key's display name (series.ts `seriesMeta`). */
@Composable
fun seriesName(seriesKey: String, categories: Map<String, Category>): String = when (seriesKey) {
    SeriesKeys.OTHER -> stringResource(R.string.insights_common_series_other)
    SeriesKeys.UNCATEGORIZED -> stringResource(R.string.insights_common_series_no_context)
    // A partner's personal category is RLS-hidden: a joint item filed under it is "Unknown", as on the web.
    else -> categories[seriesKey]?.name ?: stringResource(R.string.insights_common_series_unknown)
}

private const val DARK_LIFT = 0.42f
