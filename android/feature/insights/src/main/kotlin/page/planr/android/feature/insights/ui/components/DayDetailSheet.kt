package page.planr.android.feature.insights.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.ZoneId
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.model.Flexibility
import page.planr.android.core.insights.model.Focus
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.selectors.DayDetail
import page.planr.android.core.model.Category
import page.planr.android.feature.insights.R

/** A day's items, as counted by the chart that opened it (day-detail-sheet.tsx). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DayDetailSheet(
    model: DayDetailModel,
    categories: Map<String, Category>,
    zone: ZoneId,
    onDismiss: () -> Unit,
    onOpenInCalendar: (LocalDate) -> Unit,
) {
    val locale = rememberLabelLocale()
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = PlanrSpacing.xl)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
        ) {
            Text(
                InsightsLabels.dayTitle(model.dayStart, zone, locale),
                modifier = Modifier.semantics { heading() },
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                if (model.items.isEmpty()) {
                    stringResource(R.string.insights_common_day_nothing)
                } else {
                    pluralStringResource(
                        R.plurals.insights_common_day_summary,
                        model.items.size,
                        durationText(model.totalMs.toDouble()),
                        model.items.size,
                    )
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (model.items.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
                ) {
                    items(model.items, key = { it.key }) { item ->
                        DayItemRow(item, model, categories, zone)
                    }
                }
            }
            OutlinedButton(
                onClick = { onOpenInCalendar(model.date) },
                modifier = Modifier.padding(top = PlanrSpacing.xs, bottom = PlanrSpacing.xl),
            ) {
                Icon(InsightsIcons.CalendarDays, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(PlanrSpacing.sm))
                Text(stringResource(R.string.insights_common_day_open_in_calendar))
            }
        }
    }
}

/** One item: title (shared marker, inactive suffix) and time, then context, clipped duration and attributes. */
@Composable
private fun DayItemRow(item: Span, model: DayDetailModel, categories: Map<String, Category>, zone: ZoneId) {
    val seriesKey = SeriesKeys.of(item.categoryId)
    val chips = attributeChips(item.attributes)
    // Hairline-separated, flat: no per-item elevation.
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(PlanrRadii.lg),
        color = PlanrTheme.colors.card,
        border = BorderStroke(1.dp, PlanrTheme.colors.hairline),
    ) {
        Column(Modifier.padding(PlanrSpacing.md), verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    if (item.isShared) {
                        Icon(
                            painterResource(R.drawable.ic_insights_shared),
                            contentDescription = stringResource(R.string.insights_common_day_shared),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp),
                        )
                        Spacer(Modifier.width(PlanrSpacing.xs))
                    }
                    Text(
                        item.title,
                        modifier = Modifier.weight(1f, fill = false),
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (item.inactive) {
                        Spacer(Modifier.width(PlanrSpacing.sm))
                        Text(
                            stringResource(R.string.insights_common_day_inactive),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.width(PlanrSpacing.sm))
                Text(
                    if (item.allDay) {
                        stringResource(R.string.insights_common_day_all_day)
                    } else {
                        InsightsLabels.time(item.start, zone) + " – " + InsightsLabels.time(item.end, zone)
                    },
                    style = PlanrTheme.type.timeMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(8.dp)
                            .background(seriesColor(seriesKey, categories), CircleShape),
                    )
                    Spacer(Modifier.width(PlanrSpacing.xs))
                    Text(seriesName(seriesKey, categories), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    durationText(DayDetail.clippedMs(item, model.dayStart, model.dayEnd).toDouble()),
                    style = PlanrTheme.type.time,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (chips.isNotEmpty()) {
                    Text(
                        "· " + chips.joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** "Energy: 2 Steady", … in ATTRIBUTE_META order: energy, flexibility, focus, satisfaction. */
@Composable
private fun attributeChips(a: Attributes): List<String> {
    val chips = ArrayList<String>(4)
    a.energy?.let { chips += chip(R.string.insights_common_attr_energy_label, ENERGY.getValue(it)) }
    a.flexibility?.let { chips += chip(R.string.insights_common_attr_flexibility_label, FLEXIBILITY.getValue(it)) }
    a.focus?.let { chips += chip(R.string.insights_common_attr_focus_label, FOCUS.getValue(it)) }
    a.satisfaction?.let { chips += chip(R.string.insights_common_attr_satisfaction_label, SATISFACTION.getValue(it)) }
    return chips
}

@Composable
private fun chip(label: Int, option: Int): String =
    stringResource(R.string.insights_common_attr_chip, stringResource(label), stringResource(option))

private val ENERGY = mapOf(
    1 to R.string.insights_common_attr_energy_1,
    2 to R.string.insights_common_attr_energy_2,
    3 to R.string.insights_common_attr_energy_3,
    4 to R.string.insights_common_attr_energy_4,
)
private val SATISFACTION = mapOf(
    1 to R.string.insights_common_attr_satisfaction_1,
    2 to R.string.insights_common_attr_satisfaction_2,
    3 to R.string.insights_common_attr_satisfaction_3,
    4 to R.string.insights_common_attr_satisfaction_4,
)
private val FLEXIBILITY = mapOf(
    Flexibility.Fixed to R.string.insights_common_attr_flexibility_fixed,
    Flexibility.Movable to R.string.insights_common_attr_flexibility_movable,
    Flexibility.Flexible to R.string.insights_common_attr_flexibility_flexible,
)
private val FOCUS = mapOf(
    Focus.Deep to R.string.insights_common_attr_focus_deep,
    Focus.Shallow to R.string.insights_common_attr_focus_shallow,
)
