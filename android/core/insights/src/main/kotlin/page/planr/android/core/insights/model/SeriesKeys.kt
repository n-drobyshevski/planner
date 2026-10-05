package page.planr.android.core.insights.model

/** Synthetic series keys of the per-category series (trends.ts). */
object SeriesKeys {
    /** Categories folded beyond the top N. */
    const val OTHER = "__other__"

    /** `categoryId == null` when it ranks inside the top N. */
    const val UNCATEGORIZED = "__uncategorized__"

    /** trends.ts `seriesKeyOf`. */
    fun of(categoryId: String?): String = categoryId ?: UNCATEGORIZED
}
