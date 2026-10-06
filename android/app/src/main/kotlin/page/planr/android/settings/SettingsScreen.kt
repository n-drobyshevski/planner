package page.planr.android.settings

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay
import page.planr.android.R
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.model.SleepPrefsPatch
import page.planr.android.core.data.reminders.ReminderLead
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.model.Category

/**
 * Settings that change how the app behaves for the signed-in member: their
 * time zones, success notifications, this phone's event reminders and the
 * calendar side of sleep. Every
 * control applies at once; a write that doesn't go through puts the control
 * back and says so in one calm line.
 *
 * Sections are self-contained [SettingsSection]s stacked in [SettingsContent],
 * so a new one slots in without touching the others.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit, viewModel: SettingsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(painterResource(R.drawable.ic_back), contentDescription = stringResource(R.string.settings_back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        val time = state.time
        if (time == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            }
        } else {
            SettingsContent(state, time, viewModel, Modifier.padding(padding))
        }
    }
}

@Composable
private fun SettingsContent(state: SettingsUiState, time: TimeSettings, viewModel: SettingsViewModel, modifier: Modifier) {
    Column(modifier.fillMaxSize()) {
        // Pinned above the scroll, so a failed change at the bottom (sleep)
        // still shows its line; read out once as it appears.
        if (state.error == SettingsError.SaveFailed) {
            Text(
                stringResource(R.string.settings_save_failed),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.sm)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
        ) {
            TimeZoneSection(state, time, viewModel)
            HorizontalDivider()
            NotificationsSection(time, viewModel)
            HorizontalDivider()
            RemindersSection(state.reminders, state.askNotificationPermission, viewModel)
            HorizontalDivider()
            SleepSection(state, viewModel)
            Spacer(Modifier.size(PlanrSpacing.xl))
        }
    }
}

@Composable
private fun TimeZoneSection(state: SettingsUiState, time: TimeSettings, viewModel: SettingsViewModel) {
    var picking by rememberSaveable { mutableStateOf<ZoneTarget?>(null) }
    SettingsSection(
        title = stringResource(R.string.settings_time_title),
        description = stringResource(R.string.settings_time_description),
    ) {
        Field(
            label = stringResource(R.string.settings_time_primary),
            description = stringResource(R.string.settings_time_primary_description),
        ) {
            OutlinedButton(onClick = { picking = ZoneTarget.Primary }, modifier = Modifier.fillMaxWidth()) {
                Text(
                    time.timezone?.let { shownZoneLabel(it) }
                        ?: stringResource(R.string.settings_time_device_trigger, shownZoneLabel(state.deviceZone)),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            CurrentTime(time.timezone ?: state.deviceZone)
        }
        SwitchRow(
            label = stringResource(R.string.settings_time_secondary),
            description = stringResource(R.string.settings_time_secondary_description),
            checked = time.secondaryTimezone != null,
            onCheckedChange = viewModel::setSecondaryEnabled,
        )
        time.secondaryTimezone?.let { secondary ->
            OutlinedButton(onClick = { picking = ZoneTarget.Secondary }, modifier = Modifier.fillMaxWidth()) {
                Text(shownZoneLabel(secondary), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            CurrentTime(secondary)
        }
    }
    when (picking) {
        ZoneTarget.Primary -> ZonePickerDialog(
            title = stringResource(R.string.settings_time_primary),
            current = time.timezone,
            deviceZone = state.deviceZone,
            allowDevice = true,
            partners = emptyList(),
            onPick = { zone ->
                picking = null
                viewModel.setTimezone(zone)
            },
            onDismiss = { picking = null },
        )
        ZoneTarget.Secondary -> ZonePickerDialog(
            title = stringResource(R.string.settings_time_secondary),
            current = time.secondaryTimezone,
            deviceZone = state.deviceZone,
            allowDevice = false,
            partners = state.partnerZones,
            onPick = { zone ->
                picking = null
                if (zone != null) viewModel.setSecondaryTimezone(zone)
            },
            onDismiss = { picking = null },
        )
        null -> Unit
    }
}

private enum class ZoneTarget { Primary, Secondary }

/** "Currently Tue, 14:05 in Europe / Berlin", ticking every half minute. */
@Composable
private fun CurrentTime(zone: String) {
    val zoneId = remember(zone) { runCatching { ZoneId.of(zone) }.getOrNull() } ?: return
    val now by produceState(ZonedDateTime.now(zoneId), zoneId) {
        while (true) {
            value = ZonedDateTime.now(zoneId)
            delay(30_000)
        }
    }
    val formatter = remember { DateTimeFormatter.ofPattern("EEE, HH:mm", Locale.getDefault()) }
    Hint(stringResource(R.string.settings_time_currently, now.format(formatter), zoneLabel(zone)))
}

@Composable
private fun NotificationsSection(time: TimeSettings, viewModel: SettingsViewModel) {
    SettingsSection(title = stringResource(R.string.settings_notifications_title)) {
        SwitchRow(
            label = stringResource(R.string.settings_success_toasts),
            description = stringResource(R.string.settings_success_toasts_description),
            checked = time.showSuccessToasts,
            onCheckedChange = viewModel::setShowSuccessToasts,
        )
    }
}

@Composable
private fun RemindersSection(reminders: ReminderSettings, askPermission: Boolean, viewModel: SettingsViewModel) {
    val context = LocalContext.current
    val permission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
        viewModel::onNotificationPermissionResult,
    )
    LaunchedEffect(askPermission) {
        // Only asked for on Android 13+ (the view model knows); the check keeps lint sure of it.
        if (askPermission && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Marked first, so a recomposition (or rotation) doesn't ask twice.
            viewModel.onNotificationPermissionAsked()
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    // Notifications may have been allowed or blocked in the system's settings meanwhile.
    LifecycleResumeEffect(Unit) {
        viewModel.refreshNotificationAccess()
        onPauseOrDispose {}
    }
    SettingsSection(
        title = stringResource(R.string.settings_reminders_title),
        description = stringResource(R.string.settings_reminders_description),
    ) {
        Field(label = stringResource(R.string.settings_reminders_lead), description = null) {
            ChoiceField(
                selected = leadLabel(reminders.lead),
                options = ReminderLead.entries.map { it to leadLabel(it) },
                onSelect = viewModel::setReminderLead,
            )
        }
        if (reminders.blocked) {
            Column(
                verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            ) {
                Hint(stringResource(R.string.settings_reminders_blocked))
                TextButton(onClick = { openNotificationSettings(context) }) {
                    Text(stringResource(R.string.settings_reminders_open_settings))
                }
            }
        }
    }
}

@Composable
private fun leadLabel(lead: ReminderLead): String =
    if (lead == ReminderLead.Off) {
        stringResource(R.string.settings_reminders_off)
    } else {
        pluralStringResource(R.plurals.settings_reminders_minutes_before, lead.minutes, lead.minutes)
    }

/** The app's page in the system's notification settings; its app info page where that one is missing. */
private fun openNotificationSettings(context: Context) {
    val notifications = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    try {
        context.startActivity(notifications)
    } catch (_: ActivityNotFoundException) {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
        )
    }
}

@Composable
private fun SleepSection(state: SettingsUiState, viewModel: SettingsViewModel) {
    SettingsSection(
        title = stringResource(R.string.settings_sleep_title),
        description = stringResource(R.string.settings_sleep_description),
    ) {
        when (val sleep = state.sleep) {
            SleepSettings.Loading -> CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            SleepSettings.Unavailable -> Row(verticalAlignment = Alignment.CenterVertically) {
                Hint(stringResource(R.string.settings_sleep_unavailable), Modifier.weight(1f))
                TextButton(onClick = viewModel::retrySleep) { Text(stringResource(R.string.settings_retry)) }
            }
            is SleepSettings.Ready -> SleepFields(sleep.prefs, state.sleepCategories, viewModel)
        }
    }
}

@Composable
private fun SleepFields(prefs: SleepBlockPrefs, categories: List<Category>, viewModel: SettingsViewModel) {
    SwitchRow(
        label = stringResource(R.string.settings_sleep_auto_adjust),
        description = stringResource(
            if (prefs.sleepCategoryId == null) {
                R.string.settings_sleep_auto_adjust_description_inactive
            } else {
                R.string.settings_sleep_auto_adjust_description
            },
        ),
        checked = prefs.autoAdjust,
        onCheckedChange = viewModel::setAutoAdjust,
    )
    Field(
        label = stringResource(R.string.settings_sleep_category),
        description = stringResource(R.string.settings_sleep_category_description),
    ) {
        val none = stringResource(R.string.settings_sleep_category_none)
        // One that isn't offered (gone from this device's cache, or not the viewer's) reads as "None".
        val selected = categories.firstOrNull { it.id == prefs.sleepCategoryId }?.name ?: none
        ChoiceField(
            selected = selected,
            options = listOf<Pair<String?, String>>(null to none) + categories.map { it.id to it.name },
            onSelect = viewModel::setSleepCategory,
        )
    }
    Field(
        label = null,
        description = stringResource(R.string.settings_sleep_night_description),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
                FieldLabel(stringResource(R.string.settings_sleep_night_start))
                ChoiceField(
                    selected = hourLabel(prefs.nightWindowStartHour),
                    options = SleepPrefsPatch.NIGHT_START_HOURS.map { it to hourLabel(it) },
                    onSelect = viewModel::setNightStart,
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
                FieldLabel(stringResource(R.string.settings_sleep_night_end))
                ChoiceField(
                    selected = hourLabel(prefs.nightWindowEndHour),
                    options = SleepPrefsPatch.NIGHT_END_HOURS.map { it to hourLabel(it) },
                    onSelect = viewModel::setNightEnd,
                )
            }
        }
    }
}

private fun hourLabel(hour: Int): String = String.format(Locale.ROOT, "%02d:00", hour)

/** One settings group: a heading, an optional line on what it governs, then its controls. */
@Composable
internal fun SettingsSection(
    title: String,
    description: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg)) {
        Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            description?.let { Hint(it) }
        }
        content()
    }
}

@Composable
private fun Field(label: String?, description: String?, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        label?.let { FieldLabel(it) }
        content()
        description?.let { Hint(it) }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Hint(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}

/** A labelled switch; the whole row toggles it and reads as one switch to TalkBack. */
@Composable
private fun SwitchRow(label: String, description: String?, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = PlanrSpacing.touchTarget)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onCheckedChange),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            description?.let { Hint(it) }
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

/** An outlined button showing [selected] that opens a menu of [options]. */
@Composable
private fun <T> ChoiceField(selected: String, options: List<Pair<T, String>>, onSelect: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Text(selected, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (value, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = {
                        open = false
                        onSelect(value)
                    },
                )
            }
        }
    }
}

/** [zone] as the picker lists it: a legacy alias ("Asia/Calcutta") reads as its primary id. */
@Composable
private fun shownZoneLabel(zone: String): String = remember(zone) { zoneLabel(ZoneChoices.displayed(zone)) }
