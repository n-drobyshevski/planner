package page.planr.android.core.insights.analytics

import page.planr.android.core.insights.filter.InsightsFilters
import page.planr.android.core.insights.model.CategoryUsage
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.MemberUsage
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.Usage
import page.planr.android.core.insights.model.UsageSummary
import page.planr.android.core.insights.model.overlap

/** Time usage over a window (lib/analytics/usage.ts). */
object UsageAnalytics {
    /**
     * usage.ts `computeUsage`. Untracked spans are dropped first; day `i`
     * covers `[days[i], days[i + 1] ?: window.end)`, so DST days keep their
     * real length and Σ perDay equals the total. The category and member
     * splits keep first-seen (span) order for equal ms.
     */
    fun computeUsage(spans: List<Span>, days: List<Long>, window: MsWindow, includeInactive: Boolean = false): Usage {
        val tracked = spans.filter { InsightsFilters.isTracked(it, includeInactive) }

        val perDay = days.mapIndexed { i, dayMs ->
            val dayEnd = days.getOrNull(i + 1) ?: window.end
            var ms = 0L
            for (s in tracked) ms += overlap(s.start, s.end, dayMs, dayEnd)
            DayUsage(dayMs, ms)
        }

        val byCategoryMap = LinkedHashMap<String?, Long>()
        val byMemberMap = LinkedHashMap<String, Long>()
        var totalMs = 0L
        var eventCount = 0
        for (s in tracked) {
            val ms = overlap(s.start, s.end, window.start, window.end)
            if (ms <= 0) continue
            totalMs += ms
            eventCount += 1
            byCategoryMap[s.categoryId] = (byCategoryMap[s.categoryId] ?: 0L) + ms
            byMemberMap[s.ownerId] = (byMemberMap[s.ownerId] ?: 0L) + ms
        }

        // Stable sorts: ties keep insertion order, as Array.prototype.sort does.
        val byCategory = byCategoryMap.map { (categoryId, ms) -> CategoryUsage(categoryId, ms) }
            .sortedWith { a, b -> b.ms.compareTo(a.ms) }
        val byMember = byMemberMap.map { (ownerId, ms) -> MemberUsage(ownerId, ms) }
            .sortedWith { a, b -> b.ms.compareTo(a.ms) }

        val activeDays = perDay.count { it.ms > 0 }
        // The first day with the strict maximum wins.
        var busiestDay: DayUsage? = null
        for (d in perDay) if (d.ms > 0 && (busiestDay == null || d.ms > busiestDay.ms)) busiestDay = d
        val dailyAverageMs = if (days.isEmpty()) 0.0 else totalMs.toDouble() / days.size

        return Usage(
            summary = UsageSummary(totalMs, eventCount, activeDays, dailyAverageMs, busiestDay),
            perDay = perDay,
            byCategory = byCategory,
            byMember = byMember,
        )
    }
}
