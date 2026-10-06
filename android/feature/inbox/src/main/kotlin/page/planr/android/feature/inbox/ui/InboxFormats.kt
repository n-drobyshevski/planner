package page.planr.android.feature.inbox.ui

import android.icu.text.DisplayContext
import android.icu.text.RelativeDateTimeFormatter
import android.icu.util.ULocale
import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaLocalDate
import kotlinx.datetime.toJavaLocalTime
import kotlinx.datetime.toLocalDateTime
import page.planr.android.feature.inbox.R

/**
 * The Inbox's date and time labels (inbox-row.tsx `describe`), in the
 * viewer's zone and the device's 12/24-hour setting. Patterns come from the
 * platform's best-pattern lookup, so English and Russian read naturally.
 *
 * [nightSkeleton] is the sleep row's date, as its sentence takes it
 * (`inbox_log_sleep_date_skeleton`): with the weekday in English ("on
 * Monday, 5 Oct"), the date alone in Russian, where "в ночь на" needs the
 * accusative and weekday names only come nominative ("на среда"), while
 * "на 7 октября" reads right.
 */
internal class InboxFormats(locale: Locale, is24Hour: Boolean, nightSkeleton: String = "EEEEdMMM") {
    private val time = formatter(locale, if (is24Hour) "Hm" else "hm")
    private val shortDate = formatter(locale, "EEEdMMM")
    private val nightDate = formatter(locale, nightSkeleton)
    private val relative = RelativeDateTimeFormatter.getInstance(
        ULocale.forLocale(locale),
        null,
        RelativeDateTimeFormatter.Style.LONG,
        DisplayContext.CAPITALIZATION_FOR_MIDDLE_OF_SENTENCE,
    )

    /** "Thu, 8 Oct, 15:00–16:00": a request's proposed slot. */
    fun slot(start: Instant, end: Instant, zone: TimeZone): String {
        val from = start.toLocalDateTime(zone)
        val to = end.toLocalDateTime(zone)
        val day = shortDate.format(from.date.toJavaLocalDate())
        return "$day, ${time.format(from.time.toJavaLocalTime())}–${time.format(to.time.toJavaLocalTime())}"
    }

    /** "Monday, 5 Oct" ("5 октября"): the night a sleep row asks about. */
    fun night(date: LocalDate): String = nightDate.format(date.toJavaLocalDate())

    /** "Mon, 5 Oct": the rating sheet's night label. */
    fun shortDate(date: LocalDate): String = shortDate.format(date.toJavaLocalDate())

    /**
     * "2 hours ago", relative to [now], to sit mid-sentence ("Ended 2 hours
     * ago"). Not `DateUtils`: it capitalizes ("Ended Yesterday"), says
     * "0 minutes ago" and counts calendar days in the device's zone.
     */
    fun ago(at: Instant, now: Instant): String {
        val ago = Ago.between(at, now)
        val unit = when (ago.unit) {
            AgoUnit.Minutes -> RelativeDateTimeFormatter.RelativeUnit.MINUTES
            AgoUnit.Hours -> RelativeDateTimeFormatter.RelativeUnit.HOURS
            AgoUnit.Days -> RelativeDateTimeFormatter.RelativeUnit.DAYS
        }
        return relative.format(ago.quantity.toDouble(), RelativeDateTimeFormatter.Direction.LAST, unit)
    }

    private fun formatter(locale: Locale, skeleton: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)
}

@Composable
internal fun rememberInboxFormats(): InboxFormats {
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val is24Hour = DateFormat.is24HourFormat(context)
    val nightSkeleton = stringResource(R.string.inbox_log_sleep_date_skeleton)
    return remember(locale, is24Hour, nightSkeleton) { InboxFormats(locale, is24Hour, nightSkeleton) }
}
