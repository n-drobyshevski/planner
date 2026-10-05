package page.planr.android.core.insights.model

/** period.ts `PeriodPreset`. [id] is the TS preset id, [token] its URL token. */
enum class PeriodPreset(val id: String, val token: String) {
    ThisWeek("this-week", "this-week"),
    LastWeek("last-week", "last-week"),
    ThisMonth("this-month", "this-month"),
    Last7d("last-7d", "7d"),
    Last30d("last-30d", "30d"),
    Last90d("last-90d", "90d"),
    Custom("custom", "custom"),
    ;

    companion object {
        fun fromId(id: String?): PeriodPreset? = entries.firstOrNull { it.id == id }
    }
}

/** period.ts `Granularity`: the bucket size of the trend charts. */
enum class Granularity(val id: String) {
    Day("day"),
    Week("week"),
    Month("month"),
    ;

    companion object {
        fun fromId(id: String?): Granularity? = entries.firstOrNull { it.id == id }
    }
}

/**
 * period.ts `PeriodState`. [customFrom] / [customTo]: any ms inside the first /
 * last (inclusive) day of a custom range. [granularity] is the REQUESTED one.
 */
data class PeriodState(
    val preset: PeriodPreset = PeriodPreset.ThisWeek,
    val customFrom: Long? = null,
    val customTo: Long? = null,
    val granularity: Granularity = Granularity.Day,
)

/**
 * period.ts `ResolvedPeriod` minus `label` (the UI formats the range itself).
 * [days] are local midnights; [buckets] tile [window] exactly; [granularity] is
 * the effective (sanitized) one.
 */
data class ResolvedPeriod(
    val window: MsWindow,
    val days: List<Long>,
    val buckets: List<Bucket>,
    val granularity: Granularity,
    val prevWindow: MsWindow,
    val prevDays: List<Long>,
    val clamped: Boolean,
)
