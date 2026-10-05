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
        actions = {
            CalendarHeaderActions(
                previous = page(-1),
                previousLabel = context.getString(R.string.widget_month_previous),
                next = page(1),
                nextLabel = context.getString(R.string.widget_month_next),
            )
        },
    ) {
        WidgetContentBody(content, signedOutMessage = context.getString(R.string.widget_month_signed_out)) { month ->
            MonthGridView(month, formats)
        }
    }
}

private fun page(delta: Int) = actionRunCallback<MonthPageAction>(actionParametersOf(MonthPageAction.DeltaKey to delta))

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
    Box(modifier = modifier) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.background)
                .clickable(openDay(context, day.date))
                .semantics { contentDescription = daySummary(context, formats, day) },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            DateLabel(day.date, isToday, muted = !day.inMonth)
            ChipStack(day.chips, slots, faded = !day.inMonth)
        }
    }
}

private val WEEK_COLUMN = 26.dp
private val DATE_HEIGHT = 28.dp
private const val MAX_CHIPS = 3

/** Frame padding (2 × 12), header (≈ 40), its spacer (6) and the weekday row (≈ 20). */
private val CHROME_HEIGHT: Dp = 90.dp
