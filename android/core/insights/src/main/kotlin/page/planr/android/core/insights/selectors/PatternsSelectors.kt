package page.planr.android.core.insights.selectors

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
    fun topWeekday(rows: List<WeekdayUsage>): WeekdayUsage = TODO("T3")

    /** `bestDaypart`: n ≥ [MIN_DAYPART_RATINGS]; strict `>`. */
    fun bestDaypart(rows: List<DaypartRating>): DaypartRating? = TODO("T3")

    /** `worstDaypart`: needs ≥ 2 rated dayparts; strict `<`. */
    fun worstDaypart(rows: List<DaypartRating>): DaypartRating? = TODO("T3")

    /** `energySummary`. */
    fun energySummary(days: List<EnergyDayLoad>): EnergySummary = TODO("T3")

    /** `hasAttributes`. */
    fun hasAttributes(deep: DeepWorkShare, best: DaypartRating?, energy: EnergySummary): Boolean = TODO("T3")

    /** `weekdayTotal`: 0 → the empty state. */
    fun weekdayTotal(rows: List<WeekdayUsage>): Long = TODO("T3")
}

/** The hour heatmap's quantization (lib/insights/view-selectors.ts `stepOf`, `heatmapBands`). */
object HeatmapSteps {
    /** Fill alpha per step (the web's `STEP_ALPHA` percentages); step 0 draws the muted track. */
    val STEP_ALPHA: FloatArray = floatArrayOf(0f, 0.25f, 0.45f, 0.70f, 1f)

    /** 0 · <30m · <1h · <2h · 2h+. */
    fun stepOf(ms: Long): Int = TODO("T3")

    /** The 168 cells folded into 42 four-hour bands, index `weekday * 6 + hour / 4`. */
    fun bands(cells: List<HeatmapCell>): List<Long> = TODO("T3")
}
