package page.planr.android.widgets

import android.content.Context
import android.icu.text.DateIntervalFormat
import android.icu.util.DateInterval
import android.icu.util.ULocale
import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.glance.GlanceTheme
import androidx.glance.unit.ColorProvider
import java.text.FieldPosition
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toJavaLocalDate
import kotlinx.datetime.toJavaLocalTime
import page.planr.android.core.design.format.DateTitles
import page.planr.android.core.design.glance.PlanrGlanceColors
import page.planr.android.core.design.theme.parseHexColor

/**
 * Date and time labels in the app's language, honouring the device's
 * 12/24-hour setting. (Glance can't load Geist Mono; the system sans has
 * tabular digits, which is what the Tabular-Time Rule asks for.)
 */
internal class WidgetFormats(context: Context) {
    private val locale: Locale = context.resources.configuration.locales[0] ?: Locale.getDefault()
    private val time = pattern(if (DateFormat.is24HourFormat(context)) "Hm" else "hm")
    private val day = pattern("EEEdMMMM")
    private val shortDay = pattern("dMMM")
    private val weekday = pattern("EEEd")
    private val month = pattern("LLLL")
    private val year = pattern("y")

    fun time(value: LocalTime): String = time.format(value.toJavaLocalTime())

    /** "Mon, 5 October"; capitalised, since Russian weekday names are lower-case. */
    fun day(value: LocalDate): String =
        DateTitles.capitalized(day.format(value.toJavaLocalDate()), locale)

    /** "5 Oct". */
    fun shortDay(value: LocalDate): String = shortDay.format(value.toJavaLocalDate())

    /** "Mon 5" / "Пн, 5": a day heading in a week. */
    fun weekday(value: LocalDate): String =
        DateTitles.capitalized(weekday.format(value.toJavaLocalDate()), locale)

    /** "October" / "Октябрь" (the stand-alone form, as a title). */
    fun month(value: LocalDate): String =
        DateTitles.capitalized(month.format(value.toJavaLocalDate()), locale)

    /** "2026". */
    fun year(value: LocalDate): String = year.format(value.toJavaLocalDate())

    /** "M" … "S" / "П" … "В": a month grid's column heads. */
    fun narrowWeekday(value: DayOfWeek): String =
        java.time.DayOfWeek.of(value.isoDayNumber).getDisplayName(TextStyle.NARROW_STANDALONE, locale)
            .uppercase(locale)

    /** "5–11 Oct", "28 Sep – 4 Oct" / "5–11 окт.": a week, in the locale's interval form. */
    fun dayRange(first: LocalDate, last: LocalDate): String {
        val format = DateIntervalFormat.getInstance("MMMd", ULocale.forLocale(locale))
        // Dates as UTC midnights, formatted in UTC, so no zone can shift them.
        format.setTimeZone(android.icu.util.TimeZone.GMT_ZONE)
        val interval = DateInterval(utcMillis(first), utcMillis(last))
        return format.format(interval, StringBuffer(), FieldPosition(0)).toString()
    }

    private fun utcMillis(value: LocalDate): Long = value.toEpochDays() * MILLIS_PER_DAY

    private fun pattern(skeleton: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)

    private companion object {
        const val MILLIS_PER_DAY = 86_400_000L
    }
}

/**
 * The colour bar for [tone]. A member's own `members.color` wins (it is their
 * identity on both themes); otherwise the design defaults.
 */
@Composable
internal fun toneColor(tone: MemberTone): ColorProvider = when (tone.slot) {
    MemberTone.Slot.Shared -> PlanrGlanceColors.shared
    MemberTone.Slot.MemberA -> memberColor(tone.hex) ?: PlanrGlanceColors.memberA
    MemberTone.Slot.MemberB -> memberColor(tone.hex) ?: PlanrGlanceColors.memberB
    MemberTone.Slot.Neutral -> GlanceTheme.colors.outline
}

private fun memberColor(hex: String?): ColorProvider? =
    parseHexColor(hex, Color.Unspecified).takeIf { it != Color.Unspecified }?.let { ColorProvider(it) }
