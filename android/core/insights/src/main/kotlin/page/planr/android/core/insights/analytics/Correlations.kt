package page.planr.android.core.insights.analytics

import java.time.ZoneId
import page.planr.android.core.insights.model.CategoryRating
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.DaypartRating
import page.planr.android.core.insights.model.DeepWorkShare
import page.planr.android.core.insights.model.EnergyDayLoad
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span

/** Attribute lenses (lib/analytics/correlations.ts). */
object CorrelationsAnalytics {
    const val MIN_CATEGORY_RATINGS = 5

    /** correlations.ts `DAYPARTS`: display order. */
    val DAYPARTS: List<Daypart> = listOf(Daypart.Morning, Daypart.Midday, Daypart.Evening, Daypart.Night)

    /** correlations.ts `daypartOfHour`. */
    fun daypartOfHour(hour: Int): Daypart = TODO("A2")

    /** correlations.ts `satisfactionByCategory`. */
    fun satisfactionByCategory(spans: List<Span>, window: MsWindow): List<CategoryRating> = TODO("A2")

    /** correlations.ts `energyLoadPerDay`. */
    fun energyLoadPerDay(spans: List<Span>, days: List<Long>, window: MsWindow): List<EnergyDayLoad> = TODO("A2")

    /** correlations.ts `deepWorkShare`. */
    fun deepWorkShare(spans: List<Span>, window: MsWindow): DeepWorkShare = TODO("A2")

    /** correlations.ts `satisfactionByDaypart`. */
    fun satisfactionByDaypart(spans: List<Span>, window: MsWindow, zone: ZoneId): List<DaypartRating> = TODO("A2")
}
