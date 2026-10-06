package page.planr.android.core.design.format

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class DateTitlesTest {
    private val ru = Locale.forLanguageTag("ru")

    @Test
    fun `the year word after the year is dropped`() {
        assertEquals("LLLL y", DateTitles.withoutYearWord("LLLL y 'г'."))
        assertEquals("LLLL y", DateTitles.withoutYearWord("LLLL y"))
        assertEquals("y LLLL", DateTitles.withoutYearWord("y LLLL"))
    }

    @Test
    fun `a Russian month title reads like the widget's`() {
        val pattern = DateTitles.withoutYearWord("LLLL y 'г'.")
        val title = DateTimeFormatter.ofPattern(pattern, ru).format(LocalDate.of(2026, 10, 1))
        assertEquals("Октябрь 2026", DateTitles.capitalized(title, ru))
    }

    @Test
    fun `capitalizing leaves an already capitalized title alone`() {
        assertEquals("October 2026", DateTitles.capitalized("October 2026", Locale.ENGLISH))
        assertEquals("", DateTitles.capitalized("", ru))
    }
}
