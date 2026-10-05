package page.planr.android.feature.agenda.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrSpacing

/** One choice in a [SelectField]. */
internal data class SelectOption<T>(val value: T, val label: String, val leading: (@Composable () -> Unit)? = null)

/**
 * A compact select (the web's `Select`): a bordered field showing the current
 * choice that opens a menu. Kept local so the editor doesn't depend on
 * Material's still-shifting exposed-dropdown API.
 */
@Composable
internal fun <T> SelectField(
    selected: SelectOption<T>,
    options: List<SelectOption<T>>,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .defaultMinSize(minHeight = PlanrSpacing.touchTarget)
                .clip(MaterialTheme.shapes.medium)
                .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.medium)
                .clickable(role = Role.DropdownList) { open = true }
                .padding(horizontal = PlanrSpacing.md),
        ) {
            selected.leading?.let {
                it()
                Spacer(Modifier.width(PlanrSpacing.sm))
            }
            Text(
                text = selected.label,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(PlanrSpacing.sm))
            Icon(AgendaIcons.ChevronDown, contentDescription = null, modifier = Modifier.size(16.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    leadingIcon = option.leading,
                    onClick = {
                        open = false
                        onSelect(option.value)
                    },
                )
            }
        }
    }
}
