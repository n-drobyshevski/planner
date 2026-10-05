package page.planr.android.core.insights.selectors

import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.DaypartRating
import page.planr.android.core.insights.model.DeepWorkShare
import page.planr.android.core.insights.model.EnergyDayLoad
import page.planr.android.core.insights.model.EnergySummary
import page.planr.android.core.insights.model.HeatmapCell
import page.planr.android.core.insights.model.WeekdayUsage

/** The Patterns tab's view logic (lib/insights/view-selectors.ts, Patterns group). */
object PatternsSelectors {
    /** Minimum rated occurrences before a daypart verdict is worth showing. */
    const val MIN_DAYPART_RATINGS = 5

    /** `topWeekday`: strict `>`, Monday-first wins ties. */
    fun topWeekday(rows: List<WeekdayUsage>): WeekdayUsage = rows.reduce { a, b -> if (b.avgMs > a.avgMs) b else a }

    /** `bestDaypart`: n ≥ [MIN_DAYPART_RATINGS]; strict `>`. */
    fun bestDaypart(rows: List<DaypartRating>): DaypartRating? {
        val rated = rows.filter { it.agg.n >= MIN_DAYPART_RATINGS }
        return if (rated.isEmpty()) null else rated.reduce { a, b -> if (b.agg.mean > a.agg.mean) b else a }
    }

    /** `worstDaypart`: needs ≥ 2 rated dayparts; strict `<`. */
    fun worstDaypart(rows: List<DaypartRating>): DaypartRating? {
        val rated = rows.filter { it.agg.n >= MIN_DAYPART_RATINGS }
        return if (rated.size < 2) null else rated.reduce { a, b -> if (b.agg.mean < a.agg.mean) b else a }
    }

    /**
     * `energySummary`: the duration-weighted mean energy (1..4) and the rated
     * share of the tracked time in whole percent (JS `Math.round`), shown only
     * with a mean and a nonzero total.
     */
    fun energySummary(days: List<EnergyDayLoad>): EnergySummary {
        val ratedMs = days.sumOf { it.ratedMs }
        val weightedMs = days.sumOf { it.weightedMs }
        val totalMs = days.sumOf { it.totalMs }
        val mean = if (ratedMs > 0) weightedMs.toDouble() / ratedMs else null
        // The web's operation order: (rated / total) * 100, then round.
        val coverage = if (mean != null && totalMs > 0) JsMath.roundToInt(ratedMs.toDouble() / totalMs * 100) else null
        return EnergySummary(meanEnergy = mean, ratedMs = ratedMs, totalMs = totalMs, coveragePct = coverage)
    }

    /** `hasAttributes`: whether any attribute lens has data (else the section's empty state). */
    fun hasAttributes(deep: DeepWorkShare, best: DaypartRating?, energy: EnergySummary): Boolean =
        deep.share != null || best != null || energy.meanEnergy != null

    /** `weekdayTotal`: 0 → the empty state. */
    fun weekdayTotal(rows: List<WeekdayUsage>): Long = rows.sumOf { it.totalMs }
}

/** The hour heatmap's quantization (lib/insights/view-selectors.ts `stepOf`, `heatmapBands`). */
object HeatmapSteps {
    /** Fill alpha per step (the web's `STEP_ALPHA` percentages); step 0 draws the muted track. */
    val STEP_ALPHA: FloatArray = floatArrayOf(0f, 0.25f, 0.45f, 0.70f, 1f)

    /** 0 · <30m · <1h · <2h · 2h+. */
    fun stepOf(ms: Long): Int = when {
        ms <= 0 -> 0
        ms < 30 * MINUTE -> 1
        ms < 60 * MINUTE -> 2
        ms < 120 * MINUTE -> 3
        else -> 4
    }

    /** The 168 cells folded into 42 four-hour bands, index `weekday * 6 + hour / 4`. */
    fun bands(cells: List<HeatmapCell>): List<Long> {
        val out = LongArray(7 * 6)
        for (c in cells) out[c.weekday * 6 + c.hour / 4] += c.ms
        return out.asList()
    }

    private const val MINUTE = 60_000L
}
