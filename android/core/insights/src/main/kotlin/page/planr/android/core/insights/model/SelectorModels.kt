package page.planr.android.core.insights.model

import java.time.LocalDate

/** A share-bar row's identity: a series key, or the folded rest. */
sealed interface ShareRowId {
    data class Series(val key: String) : ShareRowId

    data object Other : ShareRowId
}

/** view-selectors.ts `shareRows` row. */
data class ShareRow(val id: ShareRowId, val ms: Long)

/** view-selectors.ts `perDaySeries` point; [prevMs] is null past the previous period's end. */
data class PerDayPoint(val dayMs: Long, val ms: Long, val avgMs: Double, val prevMs: Long?)

enum class TotalTrend(val id: String) { None("none"), Level("level"), Up("up"), Down("down") }

/** view-selectors.ts `totalChange`. */
data class TotalChange(val trend: TotalTrend, val pct: Int)

/** view-selectors.ts `energySummary`. */
data class EnergySummary(val meanEnergy: Double?, val ratedMs: Long, val totalMs: Long, val coveragePct: Int?)

/** view-selectors.ts `leadTimeParts`. */
sealed interface LeadTime {
    data class Short(val ms: Double) : LeadTime

    data class DaysHours(val days: Long, val hours: Long) : LeadTime
}

/** The day sheet's slice (view-selectors.ts `buildDayDetail`). */
data class DayDetailModel(
    val dayStart: Long,
    val dayEnd: Long,
    val date: LocalDate,
    val items: List<Span>,
    val totalMs: Long,
)
