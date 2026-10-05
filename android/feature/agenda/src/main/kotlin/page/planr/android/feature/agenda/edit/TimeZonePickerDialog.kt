package page.planr.android.feature.agenda.edit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import kotlinx.datetime.TimeZone
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.agenda.R

/** "Europe/Kaliningrad" → "Europe / Kaliningrad", for display only. */
internal fun zoneLabel(id: String): String = id.replace('_', ' ').replace("/", " / ")

/**
 * Searchable list of IANA zones. The [current] and device zones lead the
 * list so the usual choices are one tap away.
 */
@Composable
internal fun TimeZonePickerDialog(current: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    val all = remember { TimeZone.availableZoneIds.filter { '/' in it && !it.startsWith("Etc/") }.sorted() }
    val device = remember { TimeZone.currentSystemDefault().id }
    val shown = remember(query) {
        val q = query.trim().replace(' ', '_')
        val leading = listOf(current, device).distinct()
        if (q.isEmpty()) leading + (all - leading.toSet()) else all.filter { it.contains(q, ignoreCase = true) }
    }
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.extraLarge, tonalElevation = 6.dp) {
            Column(Modifier.padding(PlanrSpacing.xl)) {
                Text(stringResource(R.string.agenda_editor_time_zone), style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(stringResource(R.string.agenda_search)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(vertical = PlanrSpacing.md),
                )
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(shown, key = { it }) { id ->
                        Text(
                            text = zoneLabel(id),
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = if (id == current) FontWeight.SemiBold else FontWeight.Normal,
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(role = Role.Button) { onPick(id) }
                                .padding(vertical = PlanrSpacing.md),
                        )
                    }
                }
            }
        }
    }
}
