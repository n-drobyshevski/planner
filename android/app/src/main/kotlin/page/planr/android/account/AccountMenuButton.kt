package page.planr.android.account

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import page.planr.android.BuildConfig
import page.planr.android.R
import page.planr.android.account.health.HealthConnectSheet
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.feature.inbox.InboxBadgeViewModel
import page.planr.android.importics.IcsFileReader

/**
 * The account action on the Calendar, Tasks and Insights headers: a quiet
 * icon that opens a menu with "Inbox", "Settings", "Import .ics file",
 * "Sleep from Health Connect", "Sign out" (behind a confirmation) and,
 * below them, the app's version, for bug reports. Signing
 * out forgets the session on this device (and ends it on the server), wipes
 * the cached calendar and tasks, and blanks the widgets.
 *
 * While Inbox rows wait, a small dot sits on the icon (the web's surface
 * switcher pip) and the exact count on the menu's Inbox entry; the count is
 * also in the icon's description, so the dot is never the only signal.
 *
 * @param onImportIcs opens the import review once a picked file was read.
 * @param onOpenSettings opens the Settings screen.
 * @param onOpenInbox opens the Inbox.
 */
@Composable
fun AccountMenuButton(
    onImportIcs: () -> Unit = {},
    onOpenSettings: () -> Unit = {},
    onOpenInbox: () -> Unit = {},
    viewModel: AccountViewModel = hiltViewModel(),
    inbox: InboxBadgeViewModel = hiltViewModel(),
) {
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    var confirming by rememberSaveable { mutableStateOf(false) }
    var healthOpen by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val inboxCount by inbox.count.collectAsStateWithLifecycle()
    // Back on a tab (or from another app): reread the requests and nights behind the count.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { inbox.refresh() }
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

    val accountLabel = stringResource(R.string.account_menu)
    val inboxLabel = if (inboxCount > 0) pluralStringResource(R.plurals.account_inbox_count, inboxCount, inboxCount) else null
    IconButton(onClick = { menuOpen = true }) {
        Box {
            Icon(
                painterResource(R.drawable.ic_account),
                contentDescription = listOfNotNull(accountLabel, inboxLabel).joinToString(". "),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (inboxCount > 0) {
                // The theme's destructive token, ringed in the page color to lift it off the icon.
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 2.dp, y = (-2).dp)
                        .size(8.dp)
                        .border(1.5.dp, MaterialTheme.colorScheme.background, CircleShape)
                        .background(MaterialTheme.colorScheme.error, CircleShape),
                )
            }
        }
    }
    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.account_inbox)) },
            trailingIcon = inboxLabel?.let { label ->
                {
                    Text(
                        inboxCount.toString(),
                        style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = TABULAR_NUMS),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = label },
                    )
                }
            },
            onClick = {
                menuOpen = false
                onOpenInbox()
            },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.account_settings)) },
            onClick = {
                menuOpen = false
                onOpenSettings()
            },
        )
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
