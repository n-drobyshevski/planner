package page.planr.android.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import page.planr.android.core.design.glance.PlanrGlanceColors

/**
 * The Week grid widget: the week's range and ISO number with ‹ › paging and
 * +, then seven day columns — a header row (weekday, date) over a row of chip
 * stacks. Lines are the hairline background through 1 dp gaps, as on the
 * Month widget. Within Glance's ten children: grid = 2 rows, row = 7 days,
 * chip column = ≤ 7 chips ("+N" taking the last slot).
 */
@Composable
internal fun WeekGridContent(content: WidgetContent<WeekGrid>) {
    val context = LocalContext.current
    val formats = WidgetFormats(context)
    val week = (content as? WidgetContent.Ready)?.data
    WidgetScaffold(
        title = week?.let { formats.dayRange(it.start, it.end) } ?: context.getString(R.string.widget_week_grid_name),
        detail = week?.let { context.getString(R.string.widget_month_week, it.isoWeek) },
        onHeaderClick = actionStartActivity(WidgetLaunch.openApp(context, week?.let(::headerRoute) ?: WidgetLaunch.ROUTE_AGENDA)),
        actions = {
            CalendarHeaderActions(
                previous = page(-1),
                previousLabel = context.getString(R.string.widget_week_previous),
                next = page(1),
                nextLabel = context.getString(R.string.widget_week_next),
            )
        },
    ) {
        WidgetContentBody(content, signedOutMessage = context.getString(R.string.widget_week_signed_out)) { grid ->
            WeekGridView(grid, formats)
        }
    }
}

private fun page(delta: Int) = actionRunCallback<WeekPageAction>(actionParametersOf(WeekPageAction.DeltaKey to delta))

/** This week opens the agenda; another week opens its Monday. */
private fun headerRoute(week: WeekGrid): String =
    if (week.today in week.start..week.end) WidgetLaunch.ROUTE_AGENDA else WidgetLaunch.dayRoute(week.start)

@Composable
private fun WeekGridView(week: WeekGrid, formats: WidgetFormats) {
    val context = LocalContext.current
    // Chips per column from the widget's actual height (SizeMode.Exact).
    val slots = ((LocalSize.current.height - CHROME_HEIGHT) / CHIP_HEIGHT).toInt().coerceIn(0, MAX_CHIPS)

    Column(modifier = GlanceModifier.fillMaxSize().background(PlanrGlanceColors.hairline)) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            week.days.forEachIndexed { index, day ->
                Box(modifier = GlanceModifier.defaultWeight().padding(start = gap(index))) {
                    Column(
                        modifier = GlanceModifier
                            .fillMaxWidth()
                            .background(GlanceTheme.colors.background)
                            .padding(bottom = 3.dp)
                            .clickable(openDay(context, day.date))
                            .semantics { contentDescription = daySummary(context, formats, day) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = formats.narrowWeekday(day.date.dayOfWeek),
                            maxLines = 1,
                            style = TextStyle(
                                color = GlanceTheme.colors.onSurfaceVariant,
                                fontSize = 11.sp,
                                textAlign = TextAlign.Center,
                            ),
                        )
                        DateLabel(day.date, isToday = day.date == week.today)
                    }
                }
            }
        }
        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
            week.days.forEachIndexed { index, day ->
                Box(modifier = GlanceModifier.defaultWeight().fillMaxHeight().padding(start = gap(index), top = 1.dp)) {
                    Column(
                        modifier = GlanceModifier
                            .fillMaxSize()
                            .background(GlanceTheme.colors.background)
                            .padding(top = 2.dp)
                            .clickable(openDay(context, day.date)),
                    ) {
                        ChipStack(day.chips, slots)
                    }
                }
            }
        }
    }
}

/** No line before Monday, a hairline before every other day. */
private fun gap(index: Int): Dp = if (index == 0) 0.dp else 1.dp

private const val MAX_CHIPS = 7

/** Frame padding (2 × 12), header (≈ 40), its spacer (6), the day-header row (≈ 42) and the line and top gap (3). */
private val CHROME_HEIGHT: Dp = 115.dp
