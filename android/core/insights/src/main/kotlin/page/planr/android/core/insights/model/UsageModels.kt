package page.planr.android.core.insights.model

/** usage.ts `DayUsage`: tracked ms attributed to one local day. */
data class DayUsage(val dayMs: Long, val ms: Long)

/** usage.ts `CategoryUsage`; a null [categoryId] is uncategorized. */
data class CategoryUsage(val categoryId: String?, val ms: Long)

/** usage.ts `MemberUsage`. */
data class MemberUsage(val ownerId: String, val ms: Long)

/** usage.ts `UsageSummary`. */
data class UsageSummary(
    val totalMs: Long,
    val eventCount: Int,
    val activeDays: Int,
    val dailyAverageMs: Double,
    val busiestDay: DayUsage?,
)

/** usage.ts `Usage`. */
data class Usage(
    val summary: UsageSummary,
    val perDay: List<DayUsage>,
    val byCategory: List<CategoryUsage>,
    val byMember: List<MemberUsage>,
)
