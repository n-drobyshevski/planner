package page.planr.android.feature.agenda.edit

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlin.time.Duration.Companion.days
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.recurrence.Freq
import page.planr.android.core.recurrence.RecurrenceEnd
import page.planr.android.core.recurrence.RecurrenceForm
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.ui.AgendaFormats
import page.planr.android.feature.agenda.ui.AgendaIcons
import page.planr.android.feature.agenda.ui.SelectField
import page.planr.android.feature.agenda.ui.SelectOption

/**
 * The simple recurrence editor (the web's `RecurrenceEditor`): frequency,
 * interval, weekdays and how the series ends. Produces a [RecurrenceForm]
 * that `RRuleBuild.buildRRule` turns into the RRULE.
 *
 * @param startDate the event's start date, for the default weekday and UNTIL.
 * @param zone the zone an UNTIL date is read in (its local midnight).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RecurrencePicker(
    value: RecurrenceForm?,
    onChange: (RecurrenceForm?) -> Unit,
    startDate: LocalDate,
    zone: TimeZone,
    formats: AgendaFormats,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md)) {
        val none = SelectOption<Freq?>(null, stringResource(R.string.agenda_recurrence_does_not_repeat))
        val options = listOf(
            none,
            SelectOption<Freq?>(Freq.DAILY, stringResource(R.string.agenda_recurrence_daily)),
            SelectOption<Freq?>(Freq.WEEKLY, stringResource(R.string.agenda_recurrence_weekly)),
            SelectOption<Freq?>(Freq.MONTHLY, stringResource(R.string.agenda_recurrence_monthly)),
        )
        SelectField(
            selected = options.firstOrNull { it.value == value?.freq } ?: none,
            options = options,
            onSelect = { freq -> onChange(withFrequency(value, freq, startDate)) },
            modifier = Modifier.fillMaxWidth(),
        )
        if (value == null) return@Column

        Column(
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, PlanrTheme.colors.hairline, MaterialTheme.shapes.medium)
                .padding(PlanrSpacing.md),
        ) {
            // A daily weekday filter is a weekly cadence, so it has no interval.
            if (!(value.freq == Freq.DAILY && value.byWeekday.isNotEmpty())) {
                FieldLabel(stringResource(R.string.agenda_recurrence_every))
                Stepper(
                    value = value.interval,
                    unit = stringResource(
                        when (value.freq) {
                            Freq.DAILY -> R.string.agenda_recurrence_unit_day
                            Freq.WEEKLY -> R.string.agenda_recurrence_unit_week
                            Freq.MONTHLY -> R.string.agenda_recurrence_unit_month
                        },
                    ),
                    onChange = { onChange(value.copy(interval = it)) },
                )
            }

            if (value.freq == Freq.WEEKLY || value.freq == Freq.DAILY) {
                FieldLabel(stringResource(R.string.agenda_recurrence_on_days))
                val labels = stringArrayResource(R.array.agenda_weekday_chips)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
                    DayOfWeek.entries.forEach { day ->
                        val selected = day in value.byWeekday
                        FilterChip(
                            selected = selected,
                            onClick = {
                                onChange(value.copy(byWeekday = if (selected) value.byWeekday - day else value.byWeekday + day))
                            },
                            label = { Text(labels[day.ordinal]) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                        )
                    }
                }
            }

            FieldLabel(stringResource(R.string.agenda_recurrence_ends))
            val endOptions = listOf(
                SelectOption(EndKind.Never, stringResource(R.string.agenda_recurrence_ends_never)),
                SelectOption(EndKind.Until, stringResource(R.string.agenda_recurrence_ends_until)),
                SelectOption(EndKind.Count, stringResource(R.string.agenda_recurrence_ends_count)),
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
                SelectField(
                    selected = endOptions.first { it.value == EndKind.of(value.end) },
                    options = endOptions,
                    onSelect = { kind -> onChange(value.copy(end = defaultEnd(kind, startDate, zone))) },
                    modifier = Modifier.widthIn(min = 120.dp),
                )
                when (val end = value.end) {
                    is RecurrenceEnd.Until -> DateField(
                        date = end.date.toLocalDateTime(zone).date,
                        label = stringResource(R.string.agenda_recurrence_repeat_until_date),
                        formats = formats,
                        onPick = { onChange(value.copy(end = RecurrenceEnd.Until(it.atStartOfDayIn(zone)))) },
                    )
                    is RecurrenceEnd.Count -> Stepper(
                        value = end.count,
                        unit = null,
                        onChange = { onChange(value.copy(end = RecurrenceEnd.Count(it))) },
                    )
                    RecurrenceEnd.Never -> Unit
                }
            }
        }
    }
}

/** Which end the series has, for the "Ends" select. */
internal enum class EndKind {
    Never, Until, Count;

    companion object {
        fun of(end: RecurrenceEnd): EndKind = when (end) {
            RecurrenceEnd.Never -> Never
            is RecurrenceEnd.Until -> Until
            is RecurrenceEnd.Count -> Count
        }
    }
}

/**
 * The form after choosing [freq] (`setFreq`): weekly starts on the event's
 * own weekday when no days are chosen yet; other frequencies clear the days.
 */
internal fun withFrequency(current: RecurrenceForm?, freq: Freq?, startDate: LocalDate): RecurrenceForm? {
    if (freq == null) return null
    val days = when {
        freq != Freq.WEEKLY -> emptySet()
        current?.byWeekday?.isNotEmpty() == true -> current.byWeekday
        else -> setOf(startDate.dayOfWeek)
    }
    return RecurrenceForm(
        freq = freq,
        interval = current?.interval ?: 1,
        byWeekday = days,
        end = current?.end ?: RecurrenceEnd.Never,
    )
}

/** Defaults when switching how a series ends: 30 days after the start, or 10 times (as on the web). */
internal fun defaultEnd(kind: EndKind, startDate: LocalDate, zone: TimeZone): RecurrenceEnd = when (kind) {
    EndKind.Never -> RecurrenceEnd.Never
    EndKind.Until -> RecurrenceEnd.Until(startDate.atStartOfDayIn(zone) + 30.days)
    EndKind.Count -> RecurrenceEnd.Count(10)
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** − N + with an optional unit; never below 1. */
@Composable
private fun Stepper(value: Int, unit: String?, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onChange((value - 1).coerceAtLeast(1)) }, enabled = value > 1) {
            Icon(AgendaIcons.Minus, contentDescription = stringResource(R.string.agenda_recurrence_decrease), modifier = Modifier.size(18.dp))
        }
        Text(
            text = value.toString(),
            style = PlanrTheme.type.timeMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(min = 28.dp),
        )
        IconButton(onClick = { onChange(value + 1) }) {
            Icon(AgendaIcons.Plus, contentDescription = stringResource(R.string.agenda_recurrence_increase), modifier = Modifier.size(18.dp))
        }
        if (unit != null) {
            Text(unit, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
