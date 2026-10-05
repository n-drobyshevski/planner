package page.planr.android.core.insights.selectors

import java.time.ZoneId
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.model.Span

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
    ): DayDetailModel = TODO("U1")

    /** `clippedMs`: the span's ms inside `[start, end)`. */
    fun clippedMs(s: Span, start: Long, end: Long): Long = TODO("U1")
}
