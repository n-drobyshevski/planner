package page.planr.android.core.insights.selectors

import java.time.ZoneId
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.period.Periods

/** The day sheet's slice (lib/insights/view-selectors.ts `buildDayDetail`). */
object DayDetail {
    /**
     * dayEnd = the next entry of `period.days`, or the window end for the last
     * day; for a [dayMs] not in `period.days`, the NEXT LOCAL MIDNIGHT (a
     * deliberate fix of the web's `+ 86_400_000`, DST-safe). Items are the spans
     * touching the day, by start then [titleOrder] (stable); totalMs sums the
     * clipped time of the active ones. `Comparator<in String>` so a
     * `java.text.Collator` can be passed as is.
     */
    fun build(
        dayMs: Long,
        period: ResolvedPeriod,
        spans: List<Span>,
        zone: ZoneId,
        titleOrder: Comparator<in String>,
    ): DayDetailModel {
        val date = Periods.localDate(dayMs, zone)
        val idx = period.days.indexOf(dayMs)
        val dayEnd = if (idx >= 0) {
            period.days.getOrNull(idx + 1) ?: period.window.end
        } else {
            date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        }
        // JS `a.start - b.start || compareTitles(a.title, b.title)` on a stable sort.
        val order = Comparator<Span> { a, b ->
            val byStart = a.start.compareTo(b.start)
            if (byStart != 0) byStart else titleOrder.compare(a.title, b.title)
        }
        val items = spans.filter { it.start < dayEnd && it.end > dayMs }.sortedWith(order)
        val totalMs = items.filter { !it.inactive }.sumOf { clippedMs(it, dayMs, dayEnd) }
        return DayDetailModel(dayStart = dayMs, dayEnd = dayEnd, date = date, items = items, totalMs = totalMs)
    }

    /** `clippedMs`: the span's ms inside `[start, end)`. */
    fun clippedMs(s: Span, start: Long, end: Long): Long = maxOf(0L, minOf(s.end, end) - maxOf(s.start, start))
}
