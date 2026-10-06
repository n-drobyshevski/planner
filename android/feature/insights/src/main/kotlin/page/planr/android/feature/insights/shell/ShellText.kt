package page.planr.android.feature.insights.shell

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import java.time.ZoneId
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.feature.insights.InsightsTab
import page.planr.android.feature.insights.PeriodUi
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.components.rememberLabelLocale

/** The shell's labels: pure resource lookups plus the period label the tabs show. */
internal object ShellText {

    @StringRes
    fun preset(p: PeriodPreset): Int = when (p) {
        PeriodPreset.ThisWeek -> R.string.insights_period_this_week
        PeriodPreset.LastWeek -> R.string.insights_period_last_week
        PeriodPreset.ThisMonth -> R.string.insights_period_this_month
        PeriodPreset.Last7d -> R.string.insights_period_last_7d
        PeriodPreset.Last30d -> R.string.insights_period_last_30d
        PeriodPreset.Last90d -> R.string.insights_period_last_90d
        PeriodPreset.Custom -> R.string.insights_period_custom
    }

    @StringRes
    fun granularity(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_period_granularity_day
        Granularity.Week -> R.string.insights_period_granularity_week
        Granularity.Month -> R.string.insights_period_granularity_month
    }

    @StringRes
    fun tab(t: InsightsTab): Int = when (t) {
        InsightsTab.Overview -> R.string.insights_tab_overview
        InsightsTab.Trends -> R.string.insights_tab_trends
        InsightsTab.Patterns -> R.string.insights_tab_patterns
        InsightsTab.Tasks -> R.string.insights_tab_tasks
        InsightsTab.Sleep -> R.string.insights_tab_sleep
    }
}

/** The period's date range in the viewer's zone (period.ts `formatRange`). */
@Composable
internal fun rememberRangeText(period: PeriodUi, zone: ZoneId): String {
    val locale = rememberLabelLocale()
    return remember(period.window, zone, locale) { InsightsLabels.rangeText(period.window, zone, locale) }
}

/** "<preset> · <range>", or the range alone for a custom period (period.ts:318-319); TabEnv.periodLabel. */
@Composable
internal fun periodLabel(period: PeriodUi, zone: ZoneId): String {
    val range = rememberRangeText(period, zone)
    if (period.preset == PeriodPreset.Custom) return range
    return stringResource(R.string.insights_shell_period_label, stringResource(ShellText.preset(period.preset)), range)
}
