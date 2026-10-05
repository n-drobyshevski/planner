package page.planr.android.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.CheckBox
import androidx.glance.appwidget.CheckboxDefaults
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle

@Composable
internal fun TasksWidgetContent(content: WidgetContent<TaskList>) {
    val context = LocalContext.current
    val list = (content as? WidgetContent.Ready)?.data
    WidgetScaffold(
        title = context.getString(R.string.widget_tasks_name),
        detail = list?.takeIf { it.openCount > 0 }?.let { openCountLabel(context, it.openCount) },
        onHeaderClick = actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.ROUTE_TASKS)),
    ) {
        WidgetContentBody(content, signedOutMessage = context.getString(R.string.widget_tasks_signed_out)) { tasks ->
            if (tasks.rows.isEmpty()) {
                WidgetMessage(context.getString(R.string.widget_tasks_empty))
            } else {
                val formats = WidgetFormats(context)
                LazyColumn {
                    items(tasks.rows, itemId = { it.id.hashCode().toLong() }) { row ->
                        TaskRowView(row, formats)
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskRowView(row: TaskRow, formats: WidgetFormats) {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = 1.dp)
            .clickable(actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.taskRoute(row.id)))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val title = row.title.ifBlank { context.getString(R.string.widget_untitled_task) }
        Box(modifier = GlanceModifier.size(CONTROL_SIZE), contentAlignment = Alignment.Center) {
            if (row.canComplete) {
                val label = context.getString(R.string.widget_task_mark_done, title)
                CheckBox(
                    checked = row.completing,
                    onCheckedChange = actionRunCallback<CompleteTaskAction>(
                        actionParametersOf(CompleteTaskAction.TaskIdKey to row.id),
                    ),
                    // Fills the box so the whole target is tappable; named for TalkBack,
                    // which reaches it as a separate node from the row.
                    modifier = GlanceModifier
                        .size(CONTROL_SIZE)
                        .semantics { contentDescription = label },
                    colors = CheckboxDefaults.colors(
                        checkedColor = GlanceTheme.colors.primary,
                        // onSurfaceVariant, as the app's TaskCard: outline is under 3:1 on paper.
                        uncheckedColor = GlanceTheme.colors.onSurfaceVariant,
                    ),
                )
            } else {
                // The partner's task (only its owner may complete it), or one with no
                // done column to move to: a plain ring, no checkbox.
                Image(
                    provider = ImageProvider(R.drawable.widget_task_ring),
                    contentDescription = null,
                    colorFilter = ColorFilter.tint(GlanceTheme.colors.onSurfaceVariant),
                    modifier = GlanceModifier.size(16.dp),
                )
            }
        }
        Spacer(GlanceModifier.width(4.dp))
        Text(
            text = title,
            maxLines = 1,
            style = TextStyle(
                color = if (row.completing) GlanceTheme.colors.onSurfaceVariant else GlanceTheme.colors.onSurface,
                fontSize = 13.sp,
                textDecoration = if (row.completing) TextDecoration.LineThrough else TextDecoration.None,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
        row.due?.let { due ->
            Spacer(GlanceModifier.width(8.dp))
            Text(
                text = dueText(due, formats),
                maxLines = 1,
                style = TextStyle(
                    color = if (due is DueLabel.Overdue) GlanceTheme.colors.error else GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 12.sp,
                ),
            )
        }
    }
}

@Composable
private fun dueText(due: DueLabel, formats: WidgetFormats): String {
    val context = LocalContext.current
    return when (due) {
        is DueLabel.Overdue -> formats.shortDay(due.date)
        DueLabel.Today -> context.getString(R.string.widget_due_today)
        DueLabel.Tomorrow -> context.getString(R.string.widget_due_tomorrow)
        is DueLabel.On -> formats.shortDay(due.date)
    }
}

private fun openCountLabel(context: Context, count: Int): String =
    context.resources.getQuantityString(R.plurals.widget_tasks_open_count, count, count)

/** The checkbox's touch area (CheckBox draws its own box inside): DESIGN.md's 44dp mobile minimum. */
private val CONTROL_SIZE = 44.dp
