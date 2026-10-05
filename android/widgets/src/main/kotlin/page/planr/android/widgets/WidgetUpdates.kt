package page.planr.android.widgets

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll

/** Per-widget Glance state (the default Preferences state definition). */
internal object WidgetState {
    /** Bumped on every refresh; widgets reload from Room when it changes. */
    val RefreshTick = longPreferencesKey("planr.refresh_tick")

    /**
     * Tasks ticked in this widget whose write is still in flight, as
     * `taskId|startedAtEpochMs`. The start time lets a tick orphaned by a
     * killed process expire instead of sticking forever.
     */
    val PendingDone = stringSetPreferencesKey("planr.pending_done")

    /** Longer than any write may take (CompleteTaskAction's budget plus slack). */
    const val PENDING_TTL_MS = 30_000L

    fun tick(prefs: Preferences): Long = prefs[RefreshTick] ?: 0L

    /** Ids ticked less than [PENDING_TTL_MS] before [nowMs]. */
    fun pendingDone(prefs: Preferences, nowMs: Long = System.currentTimeMillis()): Set<String> =
        livePending(prefs[PendingDone].orEmpty(), nowMs).keys

    /** [prefs]' pending entries plus [taskId] started at [nowMs], expired ones dropped. */
    fun withPending(prefs: Preferences, taskId: String, nowMs: Long = System.currentTimeMillis()): Set<String> =
        (livePending(prefs[PendingDone].orEmpty(), nowMs) + (taskId to nowMs)).encode()

    /** [prefs]' pending entries without [taskId], expired ones dropped. */
    fun withoutPending(prefs: Preferences, taskId: String, nowMs: Long = System.currentTimeMillis()): Set<String> =
        (livePending(prefs[PendingDone].orEmpty(), nowMs) - taskId).encode()

    internal fun livePending(entries: Set<String>, nowMs: Long): Map<String, Long> =
        entries.mapNotNull { entry ->
            val id = entry.substringBeforeLast('|')
            // An entry without a start time predates expiry: treat it as orphaned.
            val startedAt = entry.substringAfterLast('|', "").toLongOrNull() ?: return@mapNotNull null
            (id to startedAt).takeIf { nowMs - startedAt in 0..PENDING_TTL_MS }
        }.toMap()

    private fun Map<String, Long>.encode(): Set<String> = mapTo(HashSet()) { (id, at) -> "$id|$at" }
}

/** Re-renders widgets from Room. */
internal object WidgetUpdates {

    /** Every Planr widget on every home screen. */
    suspend fun refreshAll(context: Context) {
        refresh(context, TodayAgendaWidget())
        refresh(context, WeekAgendaWidget())
        refresh(context, MonthWidget())
        refresh(context, TasksWidget())
        // Static; re-rendered only so a language change reaches its labels.
        QuickAddWidget().updateAll(context)
    }

    /**
     * Bumps each instance's refresh tick, then updates it: a fresh session
     * loads in `provideGlance`, a running one reloads because its state changed.
     */
    suspend fun refresh(context: Context, widget: GlanceAppWidget) {
        val ids = GlanceAppWidgetManager(context).getGlanceIds(widget.javaClass)
        for (id in ids) refresh(context, widget, id)
    }

    suspend fun refresh(context: Context, widget: GlanceAppWidget, id: GlanceId) {
        updateAppWidgetState(context, id) { prefs ->
            prefs[WidgetState.RefreshTick] = WidgetState.tick(prefs) + 1
        }
        widget.update(context, id)
    }
}
