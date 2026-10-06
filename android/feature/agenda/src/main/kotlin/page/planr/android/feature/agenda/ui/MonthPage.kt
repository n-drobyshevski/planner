package page.planr.android.feature.agenda.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.datetime.LocalDate
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.PlanrTokens
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.model.AgendaBlock
import page.planr.android.feature.agenda.model.AgendaMonthModel
import page.planr.android.feature.agenda.model.DaySchedule
import page.planr.android.feature.agenda.model.MonthDayCell

/**
 * One month of the agenda: a weekday header over six weeks of day cells,
 * each with its date (today in the date circle the week header uses) and up
 * to [AgendaMonthModel.CHIP_SLOTS] event chips, then "+N". A cell opens its
 * day. The grid fills the page; it sits in a vertical scroll that never
 * moves, so pulling down still refreshes.
 */
@Composable
internal fun MonthPage(
    month: LocalDate,
    schedule: (LocalDate) -> DaySchedule,
    today: LocalDate,
    formats: AgendaFormats,
    onOpenDay: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val weeks = AgendaMonthModel.build(month, schedule)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val pageHeight = maxHeight
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .height(pageHeight),
        ) {
            Row(Modifier.fillMaxWidth().padding(vertical = PlanrSpacing.xs)) {
                weeks.first().forEach { cell ->
                    Text(
                        text = formats.weekdayShort(cell.date),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            HorizontalDivider(color = PlanrTheme.colors.hairline)
            weeks.forEach { week ->
                Row(Modifier.fillMaxWidth().weight(1f)) {
                    week.forEach { cell ->
                        MonthCell(
                            cell = cell,
                            isToday = cell.date == today,
                            formats = formats,
                            onOpen = { onOpenDay(cell.date) },
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MonthCell(
    cell: MonthDayCell,
    isToday: Boolean,
    formats: AgendaFormats,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val metrics = LocalAgendaMetrics.current
    val lineColor = PlanrTheme.colors.hairline
    val count = cell.items.size
    val label = if (count == 0) {
        stringResource(R.string.agenda_month_day_free, formats.dayMonth(cell.date))
    } else {
        pluralStringResource(R.plurals.agenda_month_day_events, count, formats.dayMonth(cell.date), count)
    }
    BoxWithConstraints(
        modifier = modifier
            .drawBehind {
                // Hairlines between cells: one along the bottom, one down the right.
                val stroke = 1.dp.toPx()
                drawLine(lineColor, Offset(0f, size.height), Offset(size.width, size.height), strokeWidth = stroke)
                drawLine(lineColor, Offset(size.width, 0f), Offset(size.width, size.height), strokeWidth = stroke)
            }
            .clickable(onClick = onOpen)
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
            },
    ) {
        val rows = metrics.monthChipSlots(maxHeight, AgendaMonthModel.CHIP_ROWS)
        val (shown, more) = AgendaMonthModel.chipLayout(rows, count)
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MonthRowGap),
            modifier = Modifier
                .fillMaxSize()
                // A short cell (landscape, split screen) cuts its last line rather than draw over the next week.
                .clipToBounds()
                .padding(horizontal = 1.dp, vertical = 2.dp)
                // Days of the neighbouring months recede.
                .alpha(if (cell.inMonth) 1f else OutsideMonthAlpha),
        ) {
            DateCircle(cell.date, isToday)
            cell.items.take(shown).forEach { block -> MonthChip(block) }
            if (more > 0) {
                Text(
                    text = stringResource(R.string.agenda_month_more, more),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(metrics.monthChipHeight)
                        .padding(horizontal = 2.dp),
                )
            }
        }
    }
}

/** The date, in the week header's circle: filled with the primary colour on today. */
@Composable
private fun DateCircle(date: LocalDate, isToday: Boolean) {
    val metrics = LocalAgendaMetrics.current
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .sizeIn(maxWidth = metrics.dateCircle, maxHeight = metrics.dateCircle)
            .aspectRatio(1f)
            .clip(CircleShape)
            .background(if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.background),
    ) {
        Text(
            text = date.day.toString(),
            style = PlanrTheme.type.timeMedium,
            color = if (isToday) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

/** One event: its colour as a dot, then its title on one line. Inactive ones recede. */
@Composable
private fun MonthChip(block: AgendaBlock) {
    val metrics = LocalAgendaMetrics.current
    val title = block.title.ifBlank { stringResource(R.string.agenda_untitled) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .height(metrics.monthChipHeight)
            .padding(horizontal = 2.dp)
            .alpha(if (block.inactive) InactiveAlpha else 1f),
    ) {
        Box(
            Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(parseHexColor(block.color, PlanrTokens.WarmStone)),
        )
        Spacer(Modifier.width(3.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Air between a cell's date and chip lines ([monthChipSlots] counts it). */
internal val MonthRowGap = 1.dp

/** Days outside the shown month recede, as the Month widget fades them. */
private const val OutsideMonthAlpha = 0.5f

private const val InactiveAlpha = 0.6f
