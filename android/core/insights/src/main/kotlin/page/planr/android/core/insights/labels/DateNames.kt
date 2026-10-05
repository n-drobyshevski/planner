package page.planr.android.core.insights.labels

/** date-fns 4 en-US and ru name tables, copied verbatim (CLDR differs: never use java.time names). */
object DateNames {
    /** "MMM", formatting context; [month] 1..12. */
    fun monthAbbr(month: Int, l: LabelLocale): String = TODO("A3")

    /** "MMMM", formatting context (ru genitive). */
    fun monthWide(month: Int, l: LabelLocale): String = TODO("A3")

    /** "EEE"; [isoDay] 1 = Monday … 7 = Sunday. */
    fun weekdayAbbr(isoDay: Int, l: LabelLocale): String = TODO("A3")

    /** "EEEE". */
    fun weekdayWide(isoDay: Int, l: LabelLocale): String = TODO("A3")
}
