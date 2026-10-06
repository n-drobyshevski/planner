package page.planr.android.feature.agenda.ui

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toJavaLocalDate
import kotlinx.datetime.toJavaLocalTime
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.format.DateTitles

/**
 * Locale-aware date and time labels for the agenda, honoring the device's
 * 12/24-hour setting. Patterns come from the platform's best-pattern lookup,
 * so English and Russian each get their natural order and month forms.
 */
internal class AgendaFormats(private val locale: Locale, is24Hour: Boolean) {
    private val time = formatter(if (is24Hour) "Hm" else "hm")
    private val hour = formatter(if (is24Hour) "HH" else "ha")
    private val dayTitle = formatter("EEEEdMMMM")
    private val dayTitleYear = formatter("EEEEdMMMMy")
    private val dayMonth = formatter("dMMM")
    private val dayMonthYear = formatter("dMMMy")
    private val weekdayDayMonth = formatter("EEEdMMM")
    private val dayMonthLong = formatter("dMMMM")
    private val monthYear = DateTimeFormatter.ofPattern(DateTitles.monthYearPattern(locale), locale)

    fun time(instant: Instant, zone: TimeZone): String = time(instant.toLocalDateTime(zone).time)

    fun time(value: LocalTime): String = time.format(value.toJavaLocalTime())

    /** Gutter label for [hourOfDay] (0..23). */
    fun hourLabel(hourOfDay: Int): String = hour.format(java.time.LocalTime.of(hourOfDay, 0))

    /** "Sunday, 4 October" (with the year outside [currentYear]). */
    fun dayTitle(date: LocalDate, currentYear: Int): String =
        (if (date.year == currentYear) dayTitle else dayTitleYear).format(date.toJavaLocalDate())

    /** "28 Sep – 4 Oct 2026". */
    fun rangeTitle(first: LocalDate, last: LocalDate): String =
        "${dayMonth.format(first.toJavaLocalDate())} – ${dayMonthYear.format(last.toJavaLocalDate())}"

    /** "October 2026" / "Октябрь 2026": the Month view's title, written like the Month widget's. */
    fun monthTitle(month: LocalDate): String = DateTitles.capitalized(monthYear.format(month.toJavaLocalDate()), locale)

    /** "6 October": a month cell, as TalkBack reads it. */
    fun dayMonth(date: LocalDate): String = dayMonthLong.format(date.toJavaLocalDate())

    /** "4 Oct 2026": dates in the editor and recurrence summary. */
    fun date(date: LocalDate): String = dayMonthYear.format(date.toJavaLocalDate())

    /** "Sun, 4 Oct": the start / end date chips. */
    fun shortDate(date: LocalDate): String = weekdayDayMonth.format(date.toJavaLocalDate())

    /** "Mon" (column headers). */
    fun weekdayShort(date: LocalDate): String =
        java.time.DayOfWeek.of(date.dayOfWeek.isoDayNumber).getDisplayName(TextStyle.SHORT_STANDALONE, locale)

    private fun formatter(skeleton: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)
}

@Composable
internal fun rememberAgendaFormats(): AgendaFormats {
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val is24Hour = DateFormat.is24HourFormat(context)
    return remember(locale, is24Hour) { AgendaFormats(locale, is24Hour) }
}
