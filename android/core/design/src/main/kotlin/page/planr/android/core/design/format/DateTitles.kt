package page.planr.android.core.design.format

import android.text.format.DateFormat
import java.util.Locale

/**
 * Title helpers shared by the agenda and the widgets, so a month reads the
 * same in both ("Октябрь 2026", not "октябрь 2026 г.").
 */
object DateTitles {
    /** [text] with its first letter in title case for [locale]; Russian month and weekday names are lower-case. */
    fun capitalized(text: String, locale: Locale): String = text.replaceFirstChar { it.titlecase(locale) }

    /** The locale's stand-alone month-and-year pattern ("LLLL y"), without a year word after the year. */
    fun monthYearPattern(locale: Locale): String =
        withoutYearWord(DateFormat.getBestDateTimePattern(locale, "LLLLy"))

    /**
     * [pattern] without the quoted word a locale writes after the year
     * (Russian "LLLL y 'г'." → "LLLL y"), as the Month widget's title has it.
     */
    fun withoutYearWord(pattern: String): String = pattern.replace(YEAR_WORD, "$1").trim()

    private val YEAR_WORD = Regex("""(y+)\s*'[^']*'\.?""")
}
