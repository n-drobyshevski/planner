package page.planr.android.feature.insights.shell

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import page.planr.android.feature.insights.R

/**
 * Edits the custom range, pre-filled with the one already applied. Apply
 * hands back the picked first and last day; Cancel keeps the applied range.
 * Any length can be picked: the 366-day clamp happens in resolve and is
 * announced by the banner, as on the web.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CustomRangeDialog(
    first: LocalDate,
    last: LocalDate,
    onApply: (first: LocalDate, last: LocalDate) -> Unit,
    onDismiss: () -> Unit,
) {
    // The picker speaks UTC-midnight millis for a calendar date.
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = first.toPickerMillis(),
        initialSelectedEndDateMillis = last.toPickerMillis(),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                enabled = state.selectedStartDateMillis != null,
                onClick = {
                    val start = state.selectedStartDateMillis ?: return@TextButton
                    val end = state.selectedEndDateMillis ?: start
                    onApply(pickerDate(start), pickerDate(end))
                },
            ) { Text(stringResource(R.string.insights_period_apply)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.insights_period_cancel)) }
        },
    ) {
        DateRangePicker(
            state = state,
            modifier = Modifier.weight(1f),
            title = {
                Text(
                    stringResource(R.string.insights_period_custom),
                    modifier = Modifier.padding(start = 24.dp, end = 12.dp, top = 16.dp),
                )
            },
        )
    }
}

private fun LocalDate.toPickerMillis(): Long = atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun pickerDate(millis: Long): LocalDate = Instant.ofEpochMilli(millis).atOffset(ZoneOffset.UTC).toLocalDate()
