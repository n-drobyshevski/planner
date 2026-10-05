package page.planr.android.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import page.planr.android.core.design.glance.PlanrGlanceColors
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.feature.quickadd.QuickAddActivity
import page.planr.android.feature.quickadd.QuickAddKind

/**
 * The Month widget, laid out like a wall calendar: a header with the month,
 * ‹ › paging and +; weekday initials over a grid of ISO-numbered weeks whose
 * days list their events as coloured chips. Grid lines are the hairline
 * background showing through 1 dp gaps between cells (Glance has no borders),
 * so there is no outer border and none between a week number and its Monday.
 * Every container stays within Glance's ten children: grid = weekday row + ≤ 6
 * weeks, week = number + 7 days, day = date + ≤ 3 chips.
 */
@Composable
internal fun MonthContent(content: WidgetContent<MonthGrid>) {
    val context = LocalContext.current
    val formats = WidgetFormats(context)
    val grid = (content as? WidgetContent.Ready)?.data
    WidgetScaffold(
        title = grid?.let { monthTitle(it, formats) } ?: context.getString(R.string.widget_month_name),
        onHeaderClick = actionStartActivity(WidgetLaunch.openApp(context, grid?.let(::headerRoute) ?: WidgetLaunch.ROUTE_AGENDA)),
        actions = { MonthActions(context) },
    ) {
        WidgetContentBody(content, signedOutMessage = context.getString(R.string.widget_month_signed_out)) { month ->
            MonthGridView(month, formats)
        }
    }
}

/** "October"; with the year when it isn't this year's ("January 2027"). */
private fun monthTitle(grid: MonthGrid, formats: WidgetFormats): String =
    if (grid.month.year == grid.today.year) formats.month(grid.month) else "${formats.month(grid.month)} ${formats.year(grid.month)}"

/** The current month opens the agenda; another month opens its 1st. */
private fun headerRoute(grid: MonthGrid): String =
    if (grid.month.year == grid.today.year && grid.month.month == grid.today.month) {
        WidgetLaunch.ROUTE_AGENDA
    } else {
        WidgetLaunch.dayRoute(grid.month)
    }

@Composable
private fun MonthActions(context: Context) {
    HeaderIcon(R.drawable.ic_widget_chevron_left, context.getString(R.string.widget_month_previous), delta = -1)
    HeaderIcon(R.drawable.ic_widget_chevron_right, context.getString(R.string.widget_month_next), delta = 1)
    Box(
        modifier = GlanceModifier
            .padding(start = 6.dp)
            .background(ImageProvider(R.drawable.widget_pill), colorFilter = ColorFilter.tint(GlanceTheme.colors.primary))
            .cornerRadius(999.dp)
            .padding(horizontal = 14.dp, vertical = 5.dp)
            .clickable(actionStartActivity(QuickAddActivity.intent(context, QuickAddKind.Event))),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_plus),
            contentDescription = context.getString(R.string.widget_month_add_event),
            colorFilter = ColorFilter.tint(GlanceTheme.colors.onPrimary),
            modifier = GlanceModifier.size(18.dp),
        )
    }
}

@Composable
private fun HeaderIcon(icon: Int, label: String, delta: Int) {
    Image(
        provider = ImageProvider(icon),
        contentDescription = label,
        colorFilter = ColorFilter.tint(GlanceTheme.colors.onSurfaceVariant),
        modifier = GlanceModifier
            .size(32.dp)
            .padding(6.dp)
            .clickable(actionRunCallback<MonthPageAction>(actionParametersOf(MonthPageAction.DeltaKey to delta))),
    )
}

@Composable
private fun MonthGridView(grid: MonthGrid, formats: WidgetFormats) {
    // Room per cell from the widget's actual height (SizeMode.Exact): whatever
    // is left after the frame, header and weekday row, shared by the weeks.
    val gridHeight = LocalSize.current.height - CHROME_HEIGHT
    val rowHeight = gridHeight / grid.weeks.size
    val slots = ((rowHeight - DATE_HEIGHT) / CHIP_HEIGHT).toInt().coerceIn(0, MAX_CHIPS)

    Column(modifier = GlanceModifier.fillMaxSize().background(PlanrGlanceColors.hairline)) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().background(GlanceTheme.colors.background).padding(bottom = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(GlanceModifier.width(WEEK_COLUMN)) {}
            grid.weeks.first().forEach { day ->
                Text(
                    text = formats.narrowWeekday(day.date.dayOfWeek),
                    maxLines = 1,
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                    ),
                    modifier = GlanceModifier.defaultWeight(),
                )
            }
        }
        grid.weeks.forEachIndexed { index, week ->
            Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                WeekNumberCell(grid.weekNumbers[index])
                week.forEachIndexed { column, day ->
                    DayCell(
                        day = day,
                        isToday = day.date == grid.today,
                        slots = slots,
                        formats = formats,
                        modifier = GlanceModifier
                            .defaultWeight()
                            .fillMaxHeight()
                            .padding(start = if (column == 0) 0.dp else 1.dp, top = 1.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun WeekNumberCell(week: Int) {
    val context = LocalContext.current
    Box(modifier = GlanceModifier.width(WEEK_COLUMN).fillMaxHeight().padding(top = 1.dp)) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.background)
                .padding(top = 4.dp)
                .semantics { contentDescription = context.getString(R.string.widget_month_week, week) },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = week.toString(),
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp, textAlign = TextAlign.Center),
                modifier = GlanceModifier
                    .background(ImageProvider(R.drawable.widget_pill), colorFilter = ColorFilter.tint(GlanceTheme.colors.surfaceVariant))
                    .cornerRadius(6.dp)
                    .padding(horizontal = 4.dp, vertical = 1.dp),
            )
        }
    }
}

/** The date (today in a filled circle), then up to [slots] chips, the last one "+N" when they don't all fit. */
@Composable
private fun DayCell(day: MonthDay, isToday: Boolean, slots: Int, formats: WidgetFormats, modifier: GlanceModifier) {
    val context = LocalContext.current
    val summary = if (day.eventCount == 0) {
        context.getString(R.string.widget_week_free)
    } else {
        eventCountLabel(context, day.eventCount)
    }
    val (shown, more) = MonthGridModel.chipLayout(slots, day.eventCount)
    Box(modifier = modifier) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.background)
                .clickable(actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.dayRoute(day.date))))
                .semantics { contentDescription = "${formats.day(day.date)}, $summary" },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            DateLabel(day, isToday)
            day.chips.take(shown).forEach { chip -> Chip(chip, faded = !day.inMonth) }
            if (more > 0) {
                Text(
                    text = context.getString(R.string.widget_month_more, more),
                    maxLines = 1,
                    style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 10.sp),
                    modifier = GlanceModifier.height(CHIP_HEIGHT),
                )
            }
        }
    }
}

@Composable
private fun DateLabel(day: MonthDay, isToday: Boolean) {
    val style = TextStyle(
        color = when {
            isToday -> GlanceTheme.colors.onPrimary
            day.inMonth -> GlanceTheme.colors.onSurface
            else -> GlanceTheme.colors.onSurfaceVariant
        },
        fontSize = 14.sp,
        fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
        textAlign = TextAlign.Center,
    )
    val circle = GlanceModifier.size(DATE_CIRCLE)
    Box(
        modifier = if (isToday) {
            circle
                .background(ImageProvider(R.drawable.widget_dot), colorFilter = ColorFilter.tint(GlanceTheme.colors.primary))
                .cornerRadius(DATE_CIRCLE / 2)
        } else {
            circle
        },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = day.date.day.toString(), maxLines = 1, style = style)
    }
}

/** A filled chip in the event's agenda colour; the 1 dp around it is the gap between chips. */
@Composable
private fun Chip(chip: MonthChip, faded: Boolean) {
    val context = LocalContext.current
    Box(modifier = GlanceModifier.fillMaxWidth().height(CHIP_HEIGHT).padding(horizontal = 2.dp, vertical = 1.dp)) {
        Text(
            text = chip.title.ifBlank { context.getString(R.string.widget_untitled_event) },
            maxLines = 1,
            style = TextStyle(color = PlanrGlanceColors.onMeaningFill, fontSize = 10.sp, fontWeight = FontWeight.Medium),
            modifier = GlanceModifier
                .fillMaxSize()
                .background(chipColor(chip, faded))
                .cornerRadius(3.dp)
                .padding(horizontal = 3.dp),
        )
    }
}

@Composable
private fun chipColor(chip: MonthChip, faded: Boolean): ColorProvider {
    val own = parseHexColor(chip.colorHex, Color.Unspecified)
        .takeIf { it != Color.Unspecified }
        ?.let { if (faded) it.copy(alpha = FADED_ALPHA) else it }
    return own?.let { ColorProvider(it) } ?: toneColor(chip.tone)
}

private val WEEK_COLUMN = 26.dp
private val DATE_CIRCLE = 24.dp
private val DATE_HEIGHT = 28.dp
private val CHIP_HEIGHT = 16.dp
private const val MAX_CHIPS = 3

/** Days of the neighbouring months recede, as their dates do. */
private const val FADED_ALPHA = 0.55f

/** Frame padding (2 × 12), header (≈ 40), its spacer (6) and the weekday row (≈ 20). */
private val CHROME_HEIGHT: Dp = 90.dp
