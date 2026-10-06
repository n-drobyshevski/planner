package page.planr.android.settings

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import page.planr.android.R
import page.planr.android.core.design.theme.PlanrSpacing

/**
 * A searchable list of time zones (the web's zone combobox): "Use device
 * time zone" when [allowDevice] (picked as null), the partner's zone, then
 * every zone with the device's first. [current] is shown in bold.
 */
@Composable
internal fun ZonePickerDialog(
    title: String,
    current: String?,
    deviceZone: String,
    allowDevice: Boolean,
    partners: List<PartnerZone>,
    onPick: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val all = remember { ZoneChoices.all() }
    val zones = remember(query, deviceZone) { ZoneChoices.filter(all, deviceZone, query) }
    val shownPartners = remember(query, partners) { ZoneChoices.partners(partners, query) }
    val deviceLabel = stringResource(R.string.settings_time_device)
    val showDevice = allowDevice && (ZoneChoices.matches(deviceZone, query) || deviceLabel.contains(query.trim(), ignoreCase = true))
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.extraLarge, tonalElevation = 6.dp) {
            Column(Modifier.padding(PlanrSpacing.xl)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(stringResource(R.string.settings_time_search)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(vertical = PlanrSpacing.md),
                )
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    if (showDevice) {
                        group(R.string.settings_time_group_default)
                        item(key = "device") {
                            ZoneRow(deviceLabel, zoneLabel(deviceZone), selected = current == null) { onPick(null) }
                        }
                    }
                    if (shownPartners.isNotEmpty()) {
                        group(R.string.settings_time_group_workspace)
                        items(shownPartners, key = { "partner:${it.zone}" }) { partner ->
                            ZoneRow(partner.name, zoneLabel(partner.zone), selected = false) { onPick(partner.zone) }
                        }
                    }
                    if (zones.isNotEmpty()) {
                        group(R.string.settings_time_group_all)
                        items(zones, key = { it }) { zone ->
                            ZoneRow(zoneLabel(zone), hint = null, selected = zone == current) { onPick(zone) }
                        }
                    }
                    if (!showDevice && shownPartners.isEmpty() && zones.isEmpty()) {
                        item(key = "empty") {
                            Text(
                                stringResource(R.string.settings_time_empty),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = PlanrSpacing.md),
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun LazyListScope.group(@StringRes label: Int) {
    item(key = "group:$label") {
        Text(
            stringResource(label),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = PlanrSpacing.md, bottom = PlanrSpacing.xs)
                .semantics { heading() },
        )
    }
}

@Composable
private fun ZoneRow(label: String, hint: String?, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = PlanrSpacing.touchTarget)
            .clickable(role = Role.Button, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        hint?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
