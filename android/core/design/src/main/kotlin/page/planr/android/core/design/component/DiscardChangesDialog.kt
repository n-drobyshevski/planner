package page.planr.android.core.design.component

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.R

/**
 * "Discard changes?" before an editor with unsaved changes closes. Shown only
 * when something actually changed; dismissing it keeps the user editing.
 * Discard is tinted, not a solid red button: quiet about danger (DESIGN.md,
 * destructive buttons).
 */
@Composable
fun DiscardChangesDialog(onDiscard: () -> Unit, onKeepEditing: () -> Unit) {
    AlertDialog(
        onDismissRequest = onKeepEditing,
        title = { Text(stringResource(R.string.discard_changes_title)) },
        confirmButton = {
            TextButton(
                onClick = onDiscard,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) { Text(stringResource(R.string.discard_changes_confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onKeepEditing) { Text(stringResource(R.string.discard_changes_keep)) }
        },
    )
}
