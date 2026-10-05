package page.planr.android.account

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import page.planr.android.BuildConfig
import page.planr.android.R

/**
 * The account action on the Calendar and Tasks headers: a quiet icon that
 * opens a menu with "Sign out" (behind a confirmation) and, below it, the
 * app's version, for bug reports. Signing out
 * forgets the session on this device (and ends it on the server), wipes the
 * cached calendar and tasks, and blanks the widgets.
 */
@Composable
fun AccountMenuButton(viewModel: AccountViewModel = hiltViewModel()) {
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    var confirming by rememberSaveable { mutableStateOf(false) }

    IconButton(onClick = { menuOpen = true }) {
        Icon(
            painterResource(R.drawable.ic_account),
            contentDescription = stringResource(R.string.account_menu),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
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
