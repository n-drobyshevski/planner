package page.planr.android.feature.agenda.edit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.ui.AgendaFormats

/** A date button that opens Material's date picker. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DateField(
    date: LocalDate,
    label: String,
    formats: AgendaFormats,
    onPick: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val text = formats.shortDate(date)
    OutlinedButton(
        onClick = { open = true },
        modifier = modifier.semantics { contentDescription = "$label, $text" },
    ) { Text(text, maxLines = 1) }
    if (!open) return
    // The picker speaks UTC-midnight millis for a calendar date.
    val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds())
    DatePickerDialog(
        onDismissRequest = { open = false },
        confirmButton = {
            TextButton(onClick = {
                open = false
                state.selectedDateMillis?.let { ms ->
                    onPick(Instant.fromEpochMilliseconds(ms).toLocalDateTime(TimeZone.UTC).date)
                }
            }) { Text(stringResource(R.string.agenda_save)) }
        },
        dismissButton = {
            TextButton(onClick = { open = false }) { Text(stringResource(R.string.agenda_cancel)) }
        },
    ) {
        DatePicker(state = state, showModeToggle = true)
    }
}

/** A time button that opens Material's time picker (12/24 h per the device). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TimeField(
    time: LocalTime,
    label: String,
    formats: AgendaFormats,
    onPick: (LocalTime) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val text = formats.time(time)
    OutlinedButton(
        onClick = { open = true },
        modifier = modifier.semantics { contentDescription = "$label, $text" },
    ) { Text(text, maxLines = 1) }
    if (!open) return
    val is24Hour = android.text.format.DateFormat.is24HourFormat(LocalContext.current)
    val state = rememberTimePickerState(initialHour = time.hour, initialMinute = time.minute, is24Hour = is24Hour)
    BasicAlertDialog(onDismissRequest = { open = false }) {
        Surface(shape = MaterialTheme.shapes.extraLarge, tonalElevation = 6.dp) {
            Column(
                modifier = Modifier.padding(PlanrSpacing.xl),
                verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
            ) {
                Text(label, style = MaterialTheme.typography.titleMedium)
                TimePicker(state = state)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { open = false }) { Text(stringResource(R.string.agenda_cancel)) }
                    TextButton(onClick = {
                        open = false
                        onPick(LocalTime(state.hour, state.minute))
                    }) { Text(stringResource(R.string.agenda_save)) }
                }
            }
        }
    }
}

