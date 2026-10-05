package page.planr.android.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.currentState
import kotlinx.coroutines.flow.first
import kotlinx.datetime.todayIn
import page.planr.android.core.model.viewerTimeZone

/**
 * Open and due tasks for the signed-in member, plus shared ones, from the
 * Room cache. The checkbox completes a task ([CompleteTaskAction]); a row
 * opens it; the header opens the tasks list.
 */
class TasksWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val loader = TasksWidgetLoader(WidgetEntryPoint.from(context))
        val initialKey = TasksKey.of(getAppWidgetState<Preferences>(context, id))
        val initial = loader.load(initialKey.completing)
        DayRollover.sync(context)

        provideContent {
            val key = TasksKey.of(currentState<Preferences>())
            val content = rememberLoaded(initialKey, initial, key) { loader.load(it.completing) }
            TasksWidgetContent(content)
        }
    }
}

/** What the list depends on besides Room: the refresh tick and in-flight ticks. */
internal data class TasksKey(val tick: Long, val completing: Set<String>) {
    companion object {
        fun of(prefs: Preferences) = TasksKey(WidgetState.tick(prefs), WidgetState.pendingDone(prefs))
    }
}

/**
 * Reads tasks from Room for the viewer's today (their `members.timezone`,
 * else the device's, like the app's list); never touches the network.
 */
internal class TasksWidgetLoader(private val entry: WidgetEntryPoint) {
    suspend fun load(completing: Set<String>): WidgetContent<TaskList> = loadForSession(entry.sessionManager()) { session ->
        val workspace = entry.workspaceRepository()
        val members = workspace.observeMembers().first()
        val zone = viewerTimeZone(members.firstOrNull { it.id == session.memberId })
        val today = entry.clock().todayIn(zone)
        val tasks = entry.taskRepository().observeTasks().first()
        val categories = workspace.observeCategories().first()
        val boards = workspace.observeBoards().first()
        DayRollover.markRendered(today, zone)
        TasksWidgetModel.build(tasks, categories, session.memberId, today, completing, boards)
    }
}

class TasksWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TasksWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetEntryPoint.from(context).syncScheduler().syncNow()
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        DayRollover.sync(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        DayRollover.sync(context)
    }
}
