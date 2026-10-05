package page.planr.android.feature.insights.shell

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.feature.insights.PeriodUi
import page.planr.android.feature.insights.R

/**
 * The period controls at the top of every tab's list (they scroll with it):
 * a compact preset trigger with the range beside it, then the Day / Week /
 * Month buckets, the ones the window does not offer disabled.
 *
 * @param onEditCustom reopens the custom-range dialog (the range is tappable while Custom).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PeriodBar(
    period: PeriodUi,
    zone: ZoneId,
    onPreset: (PeriodPreset) -> Unit,
    onGranularity: (Granularity) -> Unit,
    onEditCustom: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md)) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            PresetTrigger(period.preset, onPreset)
            RangeText(period, zone, onEditCustom)
        }
        GranularityRow(period, onGranularity)
    }
}

/** A FilterChip-sized button (32 dp, 48 dp touch target) opening the preset menu. */
@Composable
private fun PresetTrigger(preset: PeriodPreset, onPreset: (PeriodPreset) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    val label = stringResource(ShellText.preset(preset))
    val description = stringResource(R.string.insights_period_label) + ", " + label
    Box {
        TextButton(
            onClick = { open = true },
            shape = RoundedCornerShape(PlanrRadii.sm),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
            contentPadding = PaddingValues(start = PlanrSpacing.md, end = PlanrSpacing.sm),
            modifier = Modifier
                .height(32.dp)
                .semantics { contentDescription = description },
        ) {
            Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium, maxLines = 1)
            Icon(
                ShellIcons.ChevronDown,
                contentDescription = null,
                modifier = Modifier
                    .padding(start = PlanrSpacing.xs)
                    .size(16.dp),
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            PeriodPreset.entries.forEach { option ->
                DropdownMenuItem(
                    text = {
                        Text(
                            stringResource(ShellText.preset(option)),
                            fontWeight = if (option == preset) FontWeight.SemiBold else FontWeight.Normal,
                        )
                    },
                    onClick = {
                        open = false
                        onPreset(option)
                    },
                )
            }
        }
    }
}

@Composable
private fun RangeText(period: PeriodUi, zone: ZoneId, onEditCustom: () -> Unit) {
    val range = rememberRangeText(period, zone)
    val style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = TABULAR_NUMS)
    if (period.preset != PeriodPreset.Custom) {
        Text(range, style = style, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    TextButton(
        onClick = onEditCustom,
        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onSurfaceVariant),
        contentPadding = PaddingValues(horizontal = PlanrSpacing.sm),
        modifier = Modifier.height(32.dp),
    ) {
        Icon(painterResource(R.drawable.ic_insights_calendar_range), contentDescription = null, modifier = Modifier.size(14.dp))
        Box(Modifier.width(PlanrSpacing.xs))
        Text(range, style = style)
    }
}

@Composable
private fun GranularityRow(period: PeriodUi, onGranularity: (Granularity) -> Unit) {
    val description = stringResource(R.string.insights_period_bucket_size)
    val options = Granularity.entries
    SingleChoiceSegmentedButtonRow(
        Modifier
            .fillMaxWidth()
            .semantics { contentDescription = description },
    ) {
        options.forEachIndexed { index, g ->
            SegmentedButton(
                selected = period.granularity == g,
                onClick = { onGranularity(g) },
                enabled = g in period.choices,
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                label = { Text(stringResource(ShellText.granularity(g)), maxLines = 1) },
            )
        }
    }
}
