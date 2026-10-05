package page.planr.android.feature.tasks.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.core.model.TaskPriority
import page.planr.android.feature.tasks.R
import page.planr.android.feature.tasks.model.TaskListItem

/**
 * A task row (the web's TaskCard): color edge, checkbox, title, then the
 * private / due / priority / progress signals and the assignee. Overdue is
 * carried by glyph and weight as well as color, never color alone.
 */
@Composable
internal fun TaskCard(
    item: TaskListItem,
    pending: Boolean,
    onOpen: () -> Unit,
    onToggleDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val task = item.task
    Surface(
        onClick = onOpen,
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.small,
        color = PlanrTheme.colors.card,
        border = BorderStroke(1.dp, PlanrTheme.colors.hairline),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(
                Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(taskColor(item.colorHex)),
            )
            Row(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = PlanrSpacing.md, top = PlanrSpacing.xs, bottom = PlanrSpacing.xs),
                verticalAlignment = Alignment.Top,
            ) {
                val toggleLabel = stringResource(
                    if (item.done) R.string.task_card_mark_not_done else R.string.task_card_mark_done,
                )
                Checkbox(
                    checked = item.done,
                    onCheckedChange = { onToggleDone() },
                    enabled = item.canToggleDone && !pending,
                    colors = CheckboxDefaults.colors(checkedColor = MaterialTheme.colorScheme.primary),
                    modifier = Modifier
                        .size(PlanrSpacing.touchTarget)
                        .semantics { contentDescription = toggleLabel },
                )
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(top = 11.dp, bottom = PlanrSpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
                ) {
                    Text(
                        text = task.title.ifBlank { stringResource(R.string.task_detail_untitled) },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = if (item.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                        textDecoration = if (item.done) TextDecoration.LineThrough else null,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                    TaskMeta(item)
                }
                item.assignee?.let { assignee ->
                    val label = stringResource(R.string.task_card_assignee, assignee.name)
                    MemberAvatar(
                        member = assignee,
                        modifier = Modifier
                            .padding(top = 10.dp, start = PlanrSpacing.sm)
                            .semantics { contentDescription = label },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TaskMeta(item: TaskListItem) {
    val task = item.task
    val priority = task.priorityLevel
    if (!task.isPrivate && task.dueDate == null && priority == TaskPriority.None && item.progress == null) return
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
    ) {
        if (task.isPrivate) {
            MetaLabel(R.drawable.ic_task_lock, stringResource(R.string.task_card_private), muted)
        }
        task.dueDate?.let { due ->
            val date = formatDayMonth(due, currentLocale())
            val overdueLabel = stringResource(R.string.task_card_overdue)
            MetaLabel(
                icon = if (item.overdue) R.drawable.ic_task_calendar_overdue else R.drawable.ic_task_calendar,
                text = date,
                color = if (item.overdue) MaterialTheme.colorScheme.error else muted,
                emphasized = item.overdue,
                tabular = true,
                modifier = if (item.overdue) Modifier.semantics { contentDescription = "$date, $overdueLabel" } else Modifier,
            )
        }
        if (priority != TaskPriority.None) {
            MetaLabel(
                icon = R.drawable.ic_task_flag,
                text = priorityLabel(priority),
                color = if (priority == TaskPriority.High) MaterialTheme.colorScheme.error else muted,
                emphasized = priority == TaskPriority.High,
            )
        }
        item.progress?.let { progress ->
            MetaLabel(
                icon = R.drawable.ic_task_subtask,
                text = stringResource(R.string.task_card_progress, progress.done, progress.total),
                color = muted,
                tabular = true,
            )
        }
    }
}

@Composable
private fun MetaLabel(
    icon: Int,
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    emphasized: Boolean = false,
    tabular: Boolean = false,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Text(
            text = text,
            color = color,
            style = MaterialTheme.typography.bodySmall.let { if (tabular) it.copy(fontFeatureSettings = TABULAR_NUMS) else it },
            fontWeight = if (emphasized) FontWeight.Medium else FontWeight.Normal,
        )
    }
}
