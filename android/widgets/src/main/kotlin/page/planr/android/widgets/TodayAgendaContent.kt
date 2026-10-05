package page.planr.android.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle

@Composable
internal fun TodayAgendaContent(content: WidgetContent<TodayAgenda>) {
    val context = LocalContext.current
    val formats = WidgetFormats(context)
    val agenda = (content as? WidgetContent.Ready)?.data
    WidgetScaffold(
        title = context.getString(R.string.widget_today_name),
        detail = agenda?.let { formats.day(it.date) },
        onHeaderClick = actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.ROUTE_AGENDA)),
    ) {
        WidgetContentBody(content, signedOutMessage = context.getString(R.string.widget_today_signed_out)) { today ->
            if (today.rows.isEmpty()) {
                WidgetMessage(context.getString(R.string.widget_today_empty))
            } else {
                LazyColumn {
                    items(today.rows, itemId = { it.key.hashCode().toLong() }) { row ->
                        AgendaRowView(row, formats)
                    }
                }
            }
        }
    }
}

@Composable
private fun AgendaRowView(row: AgendaRow, formats: WidgetFormats) {
    val context = LocalContext.current
    val muted = row.inactive || row.cancelled
    val ink = if (muted) GlanceTheme.colors.onSurfaceVariant else GlanceTheme.colors.onSurface
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable(actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.eventRoute(row.key)))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Whose it is: the member's colour (shared amber when joint).
        Box(
            modifier = GlanceModifier
                .width(3.dp)
                .height(20.dp)
                .cornerRadius(2.dp)
                .background(toneColor(row.tone)),
        ) {}
        Spacer(GlanceModifier.width(8.dp))
        Text(
            text = timeLabel(row.time, formats),
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp),
            modifier = GlanceModifier.width(TIME_COLUMN),
        )
        Text(
            text = row.title.ifBlank { context.getString(R.string.widget_untitled_event) },
            maxLines = 1,
            style = TextStyle(
                color = ink,
                fontSize = 13.sp,
                textDecoration = if (row.cancelled) TextDecoration.LineThrough else TextDecoration.None,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
    }
}

@Composable
private fun timeLabel(time: RowTime, formats: WidgetFormats): String {
    val context = LocalContext.current
    return when (time) {
        RowTime.AllDay -> context.getString(R.string.widget_all_day)
        is RowTime.Starts -> formats.time(time.at)
        is RowTime.Until -> context.getString(R.string.widget_until, formats.time(time.at))
    }
}

/** Fits "All day" / "Весь день" and "to 11:30 PM" at 12sp. */
private val TIME_COLUMN = 72.dp
