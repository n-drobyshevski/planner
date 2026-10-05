package page.planr.android.feature.insights.model

import java.time.ZoneId
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.model.Category

/** Render-time context the tab composables need besides their model. */
data class TabEnv(
    val zone: ZoneId,
    val categories: Map<String, Category>,
    val preset: PeriodPreset,
    /** "<preset label> · <range>", or the range alone for a custom period. */
    val periodLabel: String,
    val now: Long,
    /** The current window; part of every chart's animation key. */
    val window: MsWindow,
)
