package page.planr.android.feature.tasks.ui

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toJavaLocalDate
import kotlinx.datetime.toJavaLocalTime
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.theme.PlanrTokens
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.core.model.TaskPriority
import page.planr.android.feature.tasks.R
import page.planr.android.feature.tasks.model.TaskGroupKey

/** "Oct 4" / "4 окт." — the web's `formatDayMonthToken` for a zone-free date. */
internal fun formatDayMonth(date: LocalDate, locale: Locale): String {
    val pattern = DateFormat.getBestDateTimePattern(locale, "dMMM")
    return DateTimeFormatter.ofPattern(pattern, locale).format(date.toJavaLocalDate())
}

/** "Tue, Oct 6" / "вт, 6 окт." — a block's day. */
internal fun formatWeekdayDayMonth(date: LocalDate, locale: Locale): String {
    val pattern = DateFormat.getBestDateTimePattern(locale, "EEEdMMM")
    return DateTimeFormatter.ofPattern(pattern, locale).format(date.toJavaLocalDate())
}

/** "14:30" or "2:30 PM", following the device's 12/24-hour setting. */
internal fun formatTime(time: LocalTime, is24Hour: Boolean, locale: Locale): String =
    DateTimeFormatter.ofPattern(if (is24Hour) "HH:mm" else "h:mm a", locale).format(time.toJavaLocalTime())

@Composable
internal fun is24HourClock(): Boolean = DateFormat.is24HourFormat(LocalContext.current)

/** The locale the UI renders in (the app follows the device language). */
@Composable
@ReadOnlyComposable
internal fun currentLocale(): Locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()

/** A date as the Material date picker's UTC-midnight millis, and back. */
internal fun LocalDate.toPickerMillis(): Long = atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds()

internal fun pickerMillisToDate(millis: Long): LocalDate =
    Instant.fromEpochMilliseconds(millis).toLocalDateTime(TimeZone.UTC).date

/** A stored color hex as a Compose color; null/invalid falls back to the warm-stone neutral. */
internal fun taskColor(hex: String?): Color = parseHexColor(hex, PlanrTokens.WarmStone)

@Composable
internal fun priorityLabel(priority: TaskPriority): String = stringResource(
    when (priority) {
        TaskPriority.None -> R.string.task_priority_none
        TaskPriority.Low -> R.string.task_priority_low
        TaskPriority.Medium -> R.string.task_priority_medium
        TaskPriority.High -> R.string.task_priority_high
    },
)

@Composable
internal fun groupLabel(key: TaskGroupKey): String = stringResource(
    when (key) {
        TaskGroupKey.Overdue -> R.string.tasks_group_overdue
        TaskGroupKey.ThisWeek -> R.string.tasks_group_this_week
        TaskGroupKey.Later -> R.string.tasks_group_later
        TaskGroupKey.NoDate -> R.string.tasks_group_no_date
        TaskGroupKey.Done -> R.string.tasks_group_done
    },
)
