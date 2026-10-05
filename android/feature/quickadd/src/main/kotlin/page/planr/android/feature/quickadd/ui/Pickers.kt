package page.planr.android.feature.quickadd.ui

import android.text.format.DateFormat
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
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
import page.planr.android.feature.quickadd.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DatePickerSheet(initial: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    // The Material picker speaks UTC-midnight millis.
    val state = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                state.selectedDateMillis
                    ?.let { Instant.fromEpochMilliseconds(it).toLocalDateTime(TimeZone.UTC).date }
                    ?.let(onPick)
                    ?: onDismiss()
            }) { Text(stringResource(R.string.quickadd_apply)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.quickadd_cancel)) } },
    ) {
        DatePicker(state = state)
    }
}

/** A compact typed time entry; it fits a dialog on any phone, unlike the clock dial. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TimePickerDialog(initial: LocalTime, is24Hour: Boolean, onPick: (LocalTime) -> Unit, onDismiss: () -> Unit) {
    val state = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute, is24Hour = is24Hour)
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { onPick(LocalTime(state.hour, state.minute)) }) { Text(stringResource(R.string.quickadd_apply)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.quickadd_cancel)) } },
        text = { TimeInput(state = state) },
    )
}

/** Follows the device's 12/24-hour setting. */
@Composable
internal fun is24HourClock(): Boolean = DateFormat.is24HourFormat(LocalContext.current)

internal fun formatTime(time: LocalTime, is24Hour: Boolean, locale: Locale): String =
    DateTimeFormatter.ofPattern(if (is24Hour) "HH:mm" else "h:mm a", locale).format(time.toJavaLocalTime())

/** "Oct 4" / "4 окт." for a zone-free date. */
internal fun formatDayMonth(date: LocalDate, locale: Locale): String {
    val pattern = DateFormat.getBestDateTimePattern(locale, "dMMM")
    return DateTimeFormatter.ofPattern(pattern, locale).format(date.toJavaLocalDate())
}

@Composable
@ReadOnlyComposable
internal fun currentLocale(): Locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
