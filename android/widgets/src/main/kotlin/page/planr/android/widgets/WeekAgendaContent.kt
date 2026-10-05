package page.planr.android.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.layout.Alignment
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import kotlinx.datetime.LocalDate

@Composable
internal fun WeekAgendaContent(content: WidgetContent<WeekAgenda>) {
    val context = LocalContext.current
    val formats = WidgetFormats(context)
    val week = (content as? WidgetContent.Ready)?.data
    WidgetScaffold(
        title = context.getString(R.string.widget_week_title),
        detail = week?.let { formats.dayRange(it.first, it.last) },
        onHeaderClick = actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.ROUTE_AGENDA)),
    ) {
        WidgetContentBody(content, signedOutMessage = context.getString(R.string.widget_week_signed_out)) { agenda ->
            LazyColumn {
                items(weekItems(agenda), itemId = { it.id }) { item ->
                    when (item) {
                        is WeekItem.Day -> DayHeading(item, formats)
                        is WeekItem.Event -> AgendaRowView(item.row, formats)
                    }
                }
            }
        }
    }
}

/** The week flattened for one lazy list: a heading per day, then its events. */
private sealed interface WeekItem {
    val id: Long

    data class Day(val date: LocalDate, val today: LocalDate, val eventCount: Int) : WeekItem {
        // Above any Int hash, so a heading never shares an event's id.
        override val id: Long get() = DAY_ID_BASE + date.toEpochDays()
        val isPast: Boolean get() = date < today
        val isToday: Boolean get() = date == today
    }

    /** A spanning event shows on each of its days, so its id includes the day. */
    data class Event(val date: LocalDate, val row: AgendaRow) : WeekItem {
        override val id: Long get() = "${row.key}@$date".hashCode().toLong()
    }
}

private const val DAY_ID_BASE = 1L shl 40

/** Past days fold to their heading (with a count); today and the days ahead list their events. */
private fun weekItems(week: WeekAgenda): List<WeekItem> = week.days.flatMap { day ->
    val heading = WeekItem.Day(day.date, week.today, day.rows.size)
    if (heading.isPast) listOf(heading) else listOf(heading) + day.rows.map { WeekItem.Event(day.date, it) }
}

@Composable
private fun DayHeading(day: WeekItem.Day, formats: WidgetFormats) {
    val context = LocalContext.current
    val ink = when {
        day.isToday -> GlanceTheme.colors.primary
        day.isPast -> GlanceTheme.colors.onSurfaceVariant
        else -> GlanceTheme.colors.onSurface
    }
    val note = when {
        day.eventCount == 0 -> context.getString(R.string.widget_week_free)
        day.isPast -> eventCountLabel(context, day.eventCount)
        else -> null
    }
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(top = 6.dp, bottom = 2.dp)
            .clickable(actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.dayRoute(day.date)))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = formats.weekday(day.date),
            maxLines = 1,
            style = TextStyle(
                color = ink,
                fontSize = 12.sp,
                fontWeight = if (day.isToday) FontWeight.Bold else FontWeight.Medium,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
        if (note != null) {
            Text(
                text = note,
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp),
            )
        }
    }
}

/** "3 events" / "3 события" (a folded past day, a month cell's spoken summary). */
internal fun eventCountLabel(context: Context, count: Int): String =
    context.resources.getQuantityString(R.plurals.widget_week_event_count, count, count)
