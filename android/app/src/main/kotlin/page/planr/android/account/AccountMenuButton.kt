package page.planr.android.account

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import page.planr.android.BuildConfig
import page.planr.android.R
import page.planr.android.account.health.HealthConnectSheet
import page.planr.android.importics.IcsFileReader

/**
 * The account action on the Calendar, Tasks and Insights headers: a quiet
 * icon that opens a menu with "Import .ics file", "Sleep from Health
 * Connect", "Sign out" (behind a confirmation) and, below them, the app's
 * version, for bug reports. Signing
 * out forgets the session on this device (and ends it on the server), wipes
 * the cached calendar and tasks, and blanks the widgets.
 *
 * @param onImportIcs opens the import review once a picked file was read.
 */
@Composable
fun AccountMenuButton(onImportIcs: () -> Unit = {}, viewModel: AccountViewModel = hiltViewModel()) {
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    var confirming by rememberSaveable { mutableStateOf(false) }
    var healthOpen by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val openImport by rememberUpdatedState(onImportIcs)
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.importFile(uri)
    }
    LaunchedEffect(viewModel) {
        viewModel.importResults.collect { result ->
            when (result) {
                is IcsFileReader.Result.Text -> openImport()
                IcsFileReader.Result.TooLarge ->
                    Toast.makeText(context, R.string.import_file_too_large, Toast.LENGTH_LONG).show()
                IcsFileReader.Result.Unreadable ->
                    Toast.makeText(context, R.string.import_file_unreadable, Toast.LENGTH_LONG).show()
            }
        }
    }

    IconButton(onClick = { menuOpen = true }) {
        Icon(
            painterResource(R.drawable.ic_account),
            contentDescription = stringResource(R.string.account_menu),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.account_import_ics)) },
            onClick = {
                menuOpen = false
                pickFile.launch(ICS_MIME_TYPES)
            },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.account_health)) },
            onClick = {
                menuOpen = false
                healthOpen = true
            },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.sign_out)) },
            onClick = {
                menuOpen = false
                confirming = true
            },
        )
        HorizontalDivider()
        DropdownMenuItem(
            text = {
                Text(
                    text = stringResource(R.string.app_version, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE, BuildConfig.GIT_SHA),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            onClick = {},
            enabled = false,
        )
    }
    if (healthOpen) {
        HealthConnectSheet(onDismiss = { healthOpen = false })
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text(stringResource(R.string.sign_out_confirm_title)) },
            text = { Text(stringResource(R.string.sign_out_confirm_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirming = false
                        viewModel.signOut()
                    },
                ) { Text(stringResource(R.string.sign_out)) }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.sign_out_cancel)) }
            },
        )
    }
}

/**
 * What the picker offers: calendars by their MIME types, plus octet-stream,
 * which many file providers report for .ics.
 */
private val ICS_MIME_TYPES = arrayOf("text/calendar", "application/ics", "text/x-vcalendar", "application/octet-stream")
