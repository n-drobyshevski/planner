package page.planr.android.core.insights.model

/** correlations.ts `RatedAggregate`: duration-weighted [mean] over [n] items and [ms]. */
data class RatedAggregate(val mean: Double, val n: Int, val ms: Long)

data class CategoryRating(val categoryId: String?, val agg: RatedAggregate)

/** correlations.ts `EnergyDayLoad`. */
data class EnergyDayLoad(val dayMs: Long, val weightedMs: Long, val ratedMs: Long, val totalMs: Long)

/** correlations.ts `deepWorkShare` result; [share] is null with no focus ratings. */
data class DeepWorkShare(val deepMs: Long, val shallowMs: Long, val unratedMs: Long, val share: Double?)

/** correlations.ts `Daypart`. */
enum class Daypart(val id: String) { Morning("morning"), Midday("midday"), Evening("evening"), Night("night") }

data class DaypartRating(val daypart: Daypart, val agg: RatedAggregate)
