package page.planr.android.core.insights.analytics

import java.time.Instant
import java.time.ZoneId
import kotlin.math.max
import kotlin.math.min
import page.planr.android.core.insights.model.CategoryRating
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.DaypartRating
import page.planr.android.core.insights.model.DeepWorkShare
import page.planr.android.core.insights.model.EnergyDayLoad
import page.planr.android.core.insights.model.Focus
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.RatedAggregate
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.overlap

/**
 * Attribute lenses (lib/analytics/correlations.ts): satisfaction by category
 * and by daypart, energy-weighted load per day, and the deep-work share.
 * Every function skips inactive spans (patterns and balance do not). Means are
 * duration-weighted by the span's ms clipped to the window: `Σ ms × rating / Σ ms`.
 */
object CorrelationsAnalytics {
    /** Rated spans a category needs before it is reported. */
    const val MIN_CATEGORY_RATINGS = 5

    /** correlations.ts `DAYPARTS`: display order. */
    val DAYPARTS: List<Daypart> = listOf(Daypart.Morning, Daypart.Midday, Daypart.Evening, Daypart.Night)

    /** correlations.ts `daypartOfHour`: morning 5–12, midday 12–17, evening 17–22, night 22–5. */
    fun daypartOfHour(hour: Int): Daypart = when (hour) {
        in 5 until 12 -> Daypart.Morning
        in 12 until 17 -> Daypart.Midday
        in 17 until 22 -> Daypart.Evening
        else -> Daypart.Night
    }

    /**
     * correlations.ts `satisfactionByCategory`: categories with at least
     * [MIN_CATEGORY_RATINGS] rated spans, by mean descending (ties keep span order).
     */
    fun satisfactionByCategory(spans: List<Span>, window: MsWindow): List<CategoryRating> {
        val acc = LinkedHashMap<String?, Acc>()
        for (s in spans) {
            if (s.inactive) continue
            val satisfaction = s.attributes.satisfaction ?: continue
            val ms = overlap(s.start, s.end, window.start, window.end)
            if (ms <= 0) continue
            acc.getOrPut(s.categoryId) { Acc() }.add(ms, satisfaction)
        }
        return acc.entries
            .filter { (_, a) -> a.n >= MIN_CATEGORY_RATINGS }
            .map { (categoryId, a) -> CategoryRating(categoryId, RatedAggregate(a.weighted.toDouble() / a.ms, a.n, a.ms)) }
            .sortedWith { a, b -> b.agg.mean.compareTo(a.agg.mean) }
    }

    /**
     * correlations.ts `energyLoadPerDay`. Day `i` covers
     * `[days[i], days[i + 1] ?: window.end)` like computeUsage's perDay.
     */
    fun energyLoadPerDay(spans: List<Span>, days: List<Long>, window: MsWindow): List<EnergyDayLoad> {
        val active = spans.filter { !it.inactive }
        return days.mapIndexed { i, dayMs ->
            val dayEnd = days.getOrNull(i + 1) ?: window.end
            var weightedMs = 0L
            var ratedMs = 0L
            var totalMs = 0L
            for (s in active) {
                val ms = overlap(s.start, s.end, dayMs, dayEnd)
                if (ms <= 0) continue
                totalMs += ms
                val energy = s.attributes.energy ?: continue
                ratedMs += ms
                weightedMs += ms * energy
            }
            EnergyDayLoad(dayMs = dayMs, weightedMs = weightedMs, ratedMs = ratedMs, totalMs = totalMs)
        }
    }

    /** correlations.ts `deepWorkShare`: [DeepWorkShare.share] is deep over rated ms, null with no focus ratings. */
    fun deepWorkShare(spans: List<Span>, window: MsWindow): DeepWorkShare {
        var deepMs = 0L
        var shallowMs = 0L
        var unratedMs = 0L
        for (s in spans) {
            if (s.inactive) continue
            val ms = overlap(s.start, s.end, window.start, window.end)
            if (ms <= 0) continue
            when (s.attributes.focus) {
                Focus.Deep -> deepMs += ms
                Focus.Shallow -> shallowMs += ms
                null -> unratedMs += ms
            }
        }
        val ratedMs = deepMs + shallowMs
        return DeepWorkShare(
            deepMs = deepMs,
            shallowMs = shallowMs,
            unratedMs = unratedMs,
            share = if (ratedMs > 0) deepMs.toDouble() / ratedMs else null,
        )
    }

    /**
     * correlations.ts `satisfactionByDaypart`: rated ms sliced at local hour
     * boundaries (the heatmap's walk) and attributed to the daypart of each
     * slice's local hour. All four rows, in [DAYPARTS] order; `n` counts a span
     * once per daypart it touches, and `mean` is 0 where `ms` is 0.
     */
    fun satisfactionByDaypart(spans: List<Span>, window: MsWindow, zone: ZoneId): List<DaypartRating> {
        val acc = DAYPARTS.associateWith { Acc() }
        val touched = HashSet<Daypart>()
        for (s in spans) {
            if (s.inactive) continue
            val satisfaction = s.attributes.satisfaction ?: continue
            touched.clear()
            var cursor = max(s.start, window.start)
            val end = min(s.end, window.end)
            while (cursor < end) {
                val sliceEnd = min(PatternsAnalytics.nextHourBoundary(cursor, zone), end)
                val daypart = daypartOfHour(Instant.ofEpochMilli(cursor).atZone(zone).hour)
                val row = acc.getValue(daypart)
                row.weighted += (sliceEnd - cursor) * satisfaction
                row.ms += sliceEnd - cursor
                touched += daypart
                cursor = sliceEnd
            }
            for (d in touched) acc.getValue(d).n += 1
        }
        return DAYPARTS.map { daypart ->
            val a = acc.getValue(daypart)
            DaypartRating(daypart, RatedAggregate(if (a.ms > 0) a.weighted.toDouble() / a.ms else 0.0, a.n, a.ms))
        }
    }

    /** Running `Σ ms × rating`, count and `Σ ms` (all integral, so Long sums are exact). */
    private class Acc {
        var weighted = 0L
        var n = 0
        var ms = 0L

        fun add(ms: Long, rating: Int) {
            weighted += ms * rating
            n += 1
            this.ms += ms
        }
    }
}
