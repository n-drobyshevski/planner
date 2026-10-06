package page.planr.android.core.design.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.R
import page.planr.android.core.design.theme.PlanrSpacing

/** One optimization attribute to edit: its key and option values, in order (`ATTRIBUTE_META`). */
@Immutable
data class AttributeScale(val key: String, val options: List<String>)

/**
 * The event and task editors' "Optimization details": a collapsed row (with
 * a summary of what is set) that expands into one labelled single-choice
 * chip row per [scales] entry (`AttributeFields` on the web). Everything is
 * optional: tapping the selected option again clears it ([onSelect] with
 * null). Starts open when something is already set.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AttributeDetails(
    scales: List<AttributeScale>,
    selected: Map<String, String>,
    onSelect: (key: String, option: String?) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    var expanded by rememberSaveable { mutableStateOf(selected.isNotEmpty()) }
    val rotation by animateFloatAsState(if (expanded) 180f else 0f, label = "chevron")
    val summary = scales.filter { it.key in selected }.map { attributeLabel(it.key) }.joinToString(" · ")
    val stateText = stringResource(if (expanded) R.string.attributes_expanded else R.string.attributes_collapsed)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(MaterialTheme.shapes.small)
                .clickable(role = Role.Button) { expanded = !expanded }
                .semantics { stateDescription = stateText },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            Text(
                stringResource(R.string.attributes_details),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                summary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(
                Chevron,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp).rotate(rotation),
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg)) {
                Text(
                    stringResource(R.string.attributes_clear_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val selectedText = stringResource(R.string.attributes_option_selected)
                val notSelectedText = stringResource(R.string.attributes_option_not_selected)
                scales.forEach { scale ->
                    val current = selected[scale.key]
                    val label = attributeLabel(scale.key)
                    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
                        Text(
                            label,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        // One single-choice group per attribute: each chip is a radio
                        // button that names its attribute ("Energy: 1 Low, selected"),
                        // so it reads on its own when focus lands mid-row.
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
                            modifier = Modifier.selectableGroup(),
                        ) {
                            scale.options.forEach { option ->
                                val isSelected = current == option
                                val optionLabel = attributeOptionLabel(scale.key, option)
                                val description = stringResource(R.string.attributes_option_a11y, label, optionLabel)
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { onSelect(scale.key, if (isSelected) null else option) },
                                    enabled = enabled,
                                    label = { Text(optionLabel) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                                    ),
                                    // Outermost, so it replaces the chip's own Checkbox role.
                                    modifier = Modifier.semantics {
                                        role = Role.RadioButton
                                        contentDescription = description
                                        stateDescription = if (isSelected) selectedText else notSelectedText
                                    },
                                )
                            }
                        }
                        attributeDescription(scale.key)?.let { description ->
                            Text(
                                description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** An attribute's field label (`common.attributes.<key>.label`); the raw key for one this build doesn't know. */
@Composable
fun attributeLabel(key: String): String = when (key) {
    "energy" -> stringResource(R.string.attributes_energy_label)
    "flexibility" -> stringResource(R.string.attributes_flexibility_label)
    "focus" -> stringResource(R.string.attributes_focus_label)
    "satisfaction" -> stringResource(R.string.attributes_satisfaction_label)
    else -> key
}

@Composable
private fun attributeDescription(key: String): String? = when (key) {
    "energy" -> stringResource(R.string.attributes_energy_description)
    "flexibility" -> stringResource(R.string.attributes_flexibility_description)
    "focus" -> stringResource(R.string.attributes_focus_description)
    "satisfaction" -> stringResource(R.string.attributes_satisfaction_description)
    else -> null
}

/** An option's label, number and word together (`common.attributes.<key>.options.<value>`). */
@Composable
fun attributeOptionLabel(key: String, option: String): String = when ("$key.$option") {
    "energy.1" -> stringResource(R.string.attributes_energy_1)
    "energy.2" -> stringResource(R.string.attributes_energy_2)
    "energy.3" -> stringResource(R.string.attributes_energy_3)
    "energy.4" -> stringResource(R.string.attributes_energy_4)
    "flexibility.fixed" -> stringResource(R.string.attributes_flexibility_fixed)
    "flexibility.movable" -> stringResource(R.string.attributes_flexibility_movable)
    "flexibility.flexible" -> stringResource(R.string.attributes_flexibility_flexible)
    "focus.deep" -> stringResource(R.string.attributes_focus_deep)
    "focus.shallow" -> stringResource(R.string.attributes_focus_shallow)
    "satisfaction.1" -> stringResource(R.string.attributes_satisfaction_1)
    "satisfaction.2" -> stringResource(R.string.attributes_satisfaction_2)
    "satisfaction.3" -> stringResource(R.string.attributes_satisfaction_3)
    "satisfaction.4" -> stringResource(R.string.attributes_satisfaction_4)
    else -> option
}

/** Lucide's chevron-down, so the design module needs no icon library. */
private val Chevron: ImageVector by lazy {
    ImageVector.Builder(
        name = "ChevronDown",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).addPath(
        pathData = addPathNodes("m6 9 6 6 6-6"),
        fill = null,
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 2f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ).build()
}
