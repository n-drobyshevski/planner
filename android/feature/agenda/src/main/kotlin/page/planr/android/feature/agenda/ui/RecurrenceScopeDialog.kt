package page.planr.android.feature.agenda.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.model.RecurrenceScope

/**
 * "Apply to which events?" for a recurring edit or delete (the web's
 * `RecurrenceScopePrompt`). Delete's "All events" is tinted, not solid red:
 * quiet about danger (DESIGN.md, destructive buttons).
 */
@Composable
internal fun RecurrenceScopeDialog(
    delete: Boolean,
    onChoose: (RecurrenceScope) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(stringResource(if (delete) R.string.agenda_scope_title_delete else R.string.agenda_scope_title_edit))
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
                Text(stringResource(R.string.agenda_scope_apply_which))
                OutlinedButton(onClick = { onChoose(RecurrenceScope.This) }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.agenda_scope_this_event))
                }
                OutlinedButton(onClick = { onChoose(RecurrenceScope.Following) }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.agenda_scope_this_and_following))
                }
                Button(
                    onClick = { onChoose(RecurrenceScope.All) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = if (delete) {
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                            contentColor = MaterialTheme.colorScheme.error,
                        )
                    } else {
                        ButtonDefaults.buttonColors()
                    },
                ) {
                    Text(stringResource(R.string.agenda_scope_all_events))
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.agenda_cancel)) }
        },
    )
}
