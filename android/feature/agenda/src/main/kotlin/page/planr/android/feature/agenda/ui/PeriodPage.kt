package page.planr.android.feature.agenda.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.model.AgendaBlock
import page.planr.android.feature.agenda.model.DaySchedule
import page.planr.android.feature.agenda.model.PositionedBlock

/**
 * One period of the agenda (a day, or a week of 7 columns): week day
 * headers, the all-day row, then the scrolling 24-hour grid with the
 * current-time line. Tapping an empty slot asks to create an event there.
 */
@Composable
internal fun PeriodPage(
    days: List<LocalDate>,
    schedule: (LocalDate) -> DaySchedule,
    today: LocalDate,
    now: Instant,
    zone: TimeZone,
    scrollState: ScrollState,
    formats: AgendaFormats,
    onOpenBlock: (AgendaBlock) -> Unit,
    onOpenDay: (LocalDate) -> Unit,
    onCreateAt: ((LocalDate, minuteOfDay: Int) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val week = days.size > 1
    val schedules = days.map(schedule)
    val gutterWidth = LocalAgendaMetrics.current.gutterWidth
    Column(modifier.fillMaxSize()) {
        if (week) DayHeaders(days, today, formats, onOpenDay)
        AllDayRow(schedules, week, today, formats, onOpenBlock, onOpenDay)
        if (!week && schedules.single().isEmpty) {
            Text(
                text = stringResource(R.string.agenda_empty_title),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = gutterWidth + PlanrSpacing.sm, bottom = PlanrSpacing.xs),
            )
        }
        HorizontalDivider(color = PlanrTheme.colors.hairline)
        Row(
            Modifier
                .weight(1f)
                .verticalScroll(scrollState),
        ) {
            HourGutter(formats)
            schedules.forEach { day ->
                DayColumn(
                    day = day,
                    isToday = day.date == today,
                    now = now,
                    zone = zone,
                    compact = week,
                    formats = formats,
                    onOpenBlock = onOpenBlock,
                    onCreateAt = onCreateAt?.let { create -> { minute -> create(day.date, minute) } },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun DayHeaders(days: List<LocalDate>, today: LocalDate, formats: AgendaFormats, onOpenDay: (LocalDate) -> Unit) {
    val metrics = LocalAgendaMetrics.current
    Row(Modifier.fillMaxWidth().padding(vertical = PlanrSpacing.xs)) {
        Box(Modifier.width(metrics.gutterWidth))
        days.forEach { date ->
            val isToday = date == today
            val label = stringResource(R.string.agenda_go_to, formats.dayTitle(date, today.year))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier
                    .weight(1f)
                    .clip(MaterialTheme.shapes.small)
                    .clickable(role = Role.Button, onClick = { onOpenDay(date) })
                    .semantics(mergeDescendants = true) { contentDescription = label }
                    .padding(vertical = 2.dp),
            ) {
                Text(
                    text = formats.weekdayShort(date),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Box(
                    contentAlignment = Alignment.Center,
                    // Square, but never wider than a narrow week column.
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
                    )
                }
            }
        }
    }
}

/** All-day items as chips per day; overflow collapses into "+N more", which opens the day. */
@Composable
private fun AllDayRow(
    schedules: List<DaySchedule>,
    week: Boolean,
    today: LocalDate,
    formats: AgendaFormats,
    onOpenBlock: (AgendaBlock) -> Unit,
    onOpenDay: (LocalDate) -> Unit,
) {
    if (schedules.all { it.allDay.isEmpty() }) return
    val visible = if (week) 2 else 3
    val gutterWidth = LocalAgendaMetrics.current.gutterWidth
    Row(Modifier.fillMaxWidth().padding(bottom = PlanrSpacing.xs)) {
        Text(
            text = stringResource(R.string.agenda_all_day_header),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.End,
            maxLines = 2,
            modifier = Modifier.width(gutterWidth).padding(end = PlanrSpacing.xs, top = 4.dp),
        )
        schedules.forEach { day ->
            if (week) {
                // A ~45dp column can't hold separate 44dp targets: the whole cell
                // is one button that opens the day, where each chip is its own.
                val label = stringResource(R.string.agenda_go_to, formats.dayTitle(day.date, today.year))
                Column(
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = MinTouchTarget)
                        .padding(horizontal = 1.dp)
                        .clip(MaterialTheme.shapes.extraSmall)
                        .clickable(role = Role.Button) { onOpenDay(day.date) }
                        .semantics(mergeDescendants = true) { contentDescription = label },
                ) {
                    day.allDay.take(visible).forEach { block -> AllDayChip(block, onClick = null) }
                    MoreCount(day.allDay.size - visible)
                }
            } else {
                Column(modifier = Modifier.weight(1f).padding(horizontal = 1.dp)) {
                    day.allDay.take(visible).forEach { block ->
                        AllDayChip(block, onClick = { onOpenBlock(block) })
                    }
                    val hidden = day.allDay.size - visible
                    if (hidden > 0) {
                        Box(
                            contentAlignment = Alignment.CenterStart,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = MinTouchTarget)
                                .clip(MaterialTheme.shapes.extraSmall)
                                .clickable(role = Role.Button) { onOpenDay(day.date) },
                        ) { MoreCount(hidden) }
                    }
                }
            }
        }
    }
}

@Composable
private fun HourGutter(formats: AgendaFormats) {
    val metrics = LocalAgendaMetrics.current
    Box(Modifier.width(metrics.gutterWidth).height(metrics.hourHeight * 24)) {
        for (hour in 1 until 24) {
            Text(
                text = formats.hourLabel(hour),
                style = PlanrTheme.type.time,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.End,
                maxLines = 1,
                modifier = Modifier
                    .width(metrics.gutterWidth)
                    // Centered on the hour line.
                    .offset(y = metrics.hourHeight * hour - metrics.timeLine / 2)
                    .padding(end = PlanrSpacing.sm),
            )
        }
    }
}

@Composable
private fun DayColumn(
    day: DaySchedule,
    isToday: Boolean,
    now: Instant,
    zone: TimeZone,
    compact: Boolean,
    formats: AgendaFormats,
    onOpenBlock: (AgendaBlock) -> Unit,
    onCreateAt: ((minuteOfDay: Int) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val lineColor = MaterialTheme.colorScheme.outlineVariant
    val metrics = LocalAgendaMetrics.current
    BoxWithConstraints(
        modifier = modifier
            .height(metrics.hourHeight * 24)
            .drawBehind {
                val hour = metrics.hourHeight.toPx()
                for (h in 1 until 24) {
                    drawLine(lineColor, Offset(0f, h * hour), Offset(size.width, h * hour), strokeWidth = 1f)
                }
                drawLine(lineColor, Offset(0f, 0f), Offset(0f, size.height), strokeWidth = 1f)
            }
            .then(
                if (onCreateAt == null) {
                    Modifier
                } else {
                    Modifier.pointerInput(day.date, metrics.hourHeight) {
                        detectTapGestures { offset -> onCreateAt(slotMinuteAt(offset.y, metrics.hourHeight.toPx())) }
                    }
                },
            ),
    ) {
        val width = maxWidth
        day.contexts.forEach { ctx ->
            ContextBackdrop(
                block = ctx.block,
                showLabel = !compact,
                modifier = Modifier.place(ctx, metrics, width, gap = 0.dp),
            )
        }
        day.timed.forEach { positioned ->
            TimedEventBlock(
                block = positioned.block,
                zone = zone,
                height = metrics.blockHeight(positioned),
                compact = compact,
                formats = formats,
                onClick = { onOpenBlock(positioned.block) },
                modifier = Modifier.place(positioned, metrics, width, gap = if (compact) 1.dp else 2.dp),
            )
        }
        if (isToday) NowLine(now, zone, metrics)
    }
}

/** The current-time line (the web's `NowLine`, in the destructive red). */
@Composable
private fun NowLine(now: Instant, zone: TimeZone, metrics: AgendaMetrics) {
    val local = now.toLocalDateTime(zone)
    val y = metrics.offsetOf((local.hour * 60 + local.minute).toFloat())
    val color = MaterialTheme.colorScheme.error
    Box(
        Modifier
            .fillMaxWidth()
            .offset(y = y - 4.dp)
            .height(8.dp)
            .drawBehind {
                val mid = size.height / 2
                drawLine(color, Offset(0f, mid), Offset(size.width, mid), strokeWidth = 1.5.dp.toPx())
                drawCircle(color, radius = 4.dp.toPx(), center = Offset(0f, mid))
            },
    )
}

/** Positions a laid-out block inside its day column of width [columnWidth]. */
private fun Modifier.place(p: PositionedBlock, metrics: AgendaMetrics, columnWidth: Dp, gap: Dp): Modifier {
    val laneWidth = columnWidth / p.lanes
    return this
        .offset(x = laneWidth * p.lane + gap / 2, y = metrics.offsetOf(p.startMinute.toFloat()))
        .width((laneWidth - gap).coerceAtLeast(1.dp))
        .height(metrics.blockHeight(p))
}

/** "+N more" under the visible all-day chips; nothing when none are hidden. */
@Composable
private fun MoreCount(hidden: Int) {
    if (hidden <= 0) return
    Text(
        text = stringResource(R.string.agenda_more_count, hidden),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
    )
}
