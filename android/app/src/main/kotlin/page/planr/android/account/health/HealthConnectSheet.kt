package page.planr.android.account.health

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.text.format.DateUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.core.net.toUri
import androidx.health.connect.client.PermissionController
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import page.planr.android.R
import page.planr.android.core.data.health.HealthAvailability
import page.planr.android.core.data.health.HealthSyncProblem
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme

/**
 * "Sleep from Health Connect": connect once, and the nights a tracker
 * (Pixel Watch, Fitbit, Samsung…) writes to Health Connect show up in the
 * Sleep tab on the web. Times and stages come from the tracker; the morning
 * ratings stay the member's own.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthConnectSheet(onDismiss: () -> Unit, viewModel: HealthConnectViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val requestPermissions = rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted -> viewModel.onPermissionsResult(granted) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PlanrTheme.colors.card,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = PlanrSpacing.xl)
                .padding(bottom = PlanrSpacing.xl)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
        ) {
            Text(
                stringResource(R.string.health_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                stringResource(R.string.health_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            when {
                ui.availability == HealthAvailability.Unsupported -> Note(stringResource(R.string.health_unsupported))
                ui.availability == HealthAvailability.NeedsInstall -> {
                    Note(stringResource(R.string.health_needs_install))
                    Button(onClick = { openPlayStore(context) }) { Text(stringResource(R.string.health_install)) }
                }
                ui.connected -> {
                    Note(statusLine(ui), live = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
                        Button(onClick = viewModel::syncNow, enabled = !ui.syncing) {
                            Text(stringResource(if (ui.syncing) R.string.health_syncing else R.string.health_sync_now))
                        }
                        TextButton(onClick = viewModel::disconnect) { Text(stringResource(R.string.health_disconnect)) }
                    }
                }
                else -> {
                    when {
                        ui.denied -> Note(stringResource(R.string.health_denied), live = true)
                        ui.problem == HealthSyncProblem.PermissionLost -> Note(stringResource(R.string.health_permission_lost))
                    }
                    OutlinedButton(
                        onClick = { requestPermissions.launch(viewModel.permissions()) },
                        enabled = !ui.syncing,
                    ) {
                        Text(stringResource(if (ui.syncing) R.string.health_syncing else R.string.health_connect))
                    }
                }
            }
        }
    }
}

@Composable
private fun statusLine(ui: HealthConnectUi): String = when {
    ui.syncing -> stringResource(R.string.health_syncing)
    ui.problem == HealthSyncProblem.Failed -> stringResource(R.string.health_sync_failed)
    ui.lastSyncAt == null -> stringResource(R.string.health_connected)
    else -> {
        val ago = DateUtils.getRelativeTimeSpanString(
            ui.lastSyncAt.toEpochMilliseconds(),
            System.currentTimeMillis(),
            DateUtils.MINUTE_IN_MILLIS,
        ).toString()
        val nights = ui.lastNights ?: 0
        stringResource(R.string.health_last_synced, ago) + " · " +
            pluralStringResource(R.plurals.health_nights, nights, nights)
    }
}

@Composable
private fun Note(text: String, live: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        modifier = if (live) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier,
    )
}

/** Health Connect's Play listing (it is a separate app before Android 14). */
private fun openPlayStore(context: Context) {
    val uri = "market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding".toUri()
    val intent = Intent(Intent.ACTION_VIEW, uri).setPackage("com.android.vending")
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata".toUri()),
        )
    }
}
