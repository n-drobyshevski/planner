package page.planr.android.core.insights.analytics

import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.Usage

/** Time usage over a window (lib/analytics/usage.ts). */
object UsageAnalytics {
    /** usage.ts `computeUsage`. */
    fun computeUsage(spans: List<Span>, days: List<Long>, window: MsWindow, includeInactive: Boolean = false): Usage =
        TODO("A1")
}
