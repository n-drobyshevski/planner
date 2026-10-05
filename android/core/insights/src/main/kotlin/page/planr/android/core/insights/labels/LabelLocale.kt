package page.planr.android.core.insights.labels

/** The two app locales the Insights labels are formatted in. */
enum class LabelLocale(val tag: String) {
    En("en"),
    Ru("ru"),
    ;

    companion object {
        /** "ru" (any region) → [Ru]; everything else → [En], the web's default. */
        fun of(tag: String?): LabelLocale = if (tag?.substringBefore('-')?.substringBefore('_') == "ru") Ru else En
    }
}
