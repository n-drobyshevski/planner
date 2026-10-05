package page.planr.android.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
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
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle

@Composable
internal fun MonthContent(content: WidgetContent<MonthGrid>) {
    val context = LocalContext.current
    val formats = WidgetFormats(context)
    val grid = (content as? WidgetContent.Ready)?.data
    WidgetScaffold(
        title = grid?.let { formats.month(it.month) } ?: context.getString(R.string.widget_month_name),
        detail = grid?.let { formats.year(it.month) },
        onHeaderClick = actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.ROUTE_AGENDA)),
    ) {
        WidgetContentBody(content, signedOutMessage = context.getString(R.string.widget_month_signed_out)) { month ->
            MonthGridView(month, formats)
        }
    }
}

/** Weekday initials over four to six week rows that share the height. */
@Composable
private fun MonthGridView(grid: MonthGrid, formats: WidgetFormats) {
    Column(modifier = GlanceModifier.fillMaxSize()) {
        Row(modifier = GlanceModifier.fillMaxWidth().padding(bottom = 2.dp)) {
            grid.weeks.first().forEach { day ->
                Text(
                    text = formats.narrowWeekday(day.date.dayOfWeek),
                    maxLines = 1,
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 10.sp,
                        textAlign = TextAlign.Center,
                    ),
                    modifier = GlanceModifier.defaultWeight(),
                )
            }
        }
        grid.weeks.forEach { week ->
            Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                week.forEach { day ->
                    DayCell(day, isToday = day.date == grid.today, formats, GlanceModifier.defaultWeight().fillMaxHeight())
                }
            }
        }
    }
}

/** The date (today in a filled circle) and a dot per member with plans that day. */
@Composable
private fun DayCell(day: MonthDay, isToday: Boolean, formats: WidgetFormats, modifier: GlanceModifier) {
    val context = LocalContext.current
    val ink = when {
        isToday -> GlanceTheme.colors.onPrimary
        day.inMonth -> GlanceTheme.colors.onSurface
        else -> GlanceTheme.colors.outline
    }
    val summary = if (day.eventCount == 0) {
        context.getString(R.string.widget_week_free)
    } else {
        eventCountLabel(context, day.eventCount)
    }
    Column(
        modifier = modifier
            .clickable(actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.dayRoute(day.date))))
            .semantics { contentDescription = "${formats.day(day.date)}, $summary" },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val circle = GlanceModifier.size(DATE_SIZE)
        Box(
            modifier = if (isToday) {
                circle
                    .background(ImageProvider(R.drawable.widget_pill), colorFilter = ColorFilter.tint(GlanceTheme.colors.primary))
                    .cornerRadius(DATE_SIZE / 2)
            } else {
                circle
            },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = day.date.day.toString(),
                maxLines = 1,
                style = TextStyle(
                    color = ink,
                    fontSize = 12.sp,
                    fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                    textAlign = TextAlign.Center,
                ),
            )
        }
        if (day.tones.isNotEmpty()) {
            Row(modifier = GlanceModifier.padding(top = 1.dp)) {
                day.tones.forEach { tone ->
                    Image(
                        provider = ImageProvider(R.drawable.widget_dot),
                        contentDescription = null,
                        colorFilter = ColorFilter.tint(toneColor(tone)),
                        modifier = GlanceModifier.size(DOT_SIZE).padding(horizontal = 0.5.dp),
                    )
                }
            }
        }
    }
}

private val DATE_SIZE = 22.dp

/** Includes the half-dp gap on each side. */
private val DOT_SIZE = 6.dp
