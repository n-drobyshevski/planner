package page.planr.android.core.insights.model

/** balance.ts `CategoryShare`. */
data class CategoryShare(
    val categoryId: String?,
    val ms: Long,
    val share: Double,
    val prevMs: Long,
    val prevShare: Double,
    val deltaShare: Double,
)
