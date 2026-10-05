package page.planr.android.core.data.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.repository.EventRepository
import page.planr.android.core.data.repository.TaskRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.TimeWindow

/** Pulls Supabase into Room: the shared body of the periodic sync and Realtime reconnects. */
@Singleton
class SyncRunner @Inject constructor(
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val events: EventRepository,
    private val tasks: TaskRepository,
    private val visibleWindow: VisibleWindowTracker,
    private val widgets: WidgetRefreshDispatcher,
    private val clock: Clock,
) {

    /**
     * Members/categories/boards, today ±7 days (plus the visible window), and
     * all tasks; then re-renders widgets. Returns false when signed out.
     * Throws on network / server errors (the worker retries).
     */
    suspend fun syncAll(): Boolean {
        // A worker may start the process: wait for the stored session to load.
        session.authState.first { it != AuthState.Loading }
        if (session.currentSession == null) return false
        coroutineScope {
            launch { workspace.refresh() }
            windowsToSync().forEach { launch { events.refreshWindow(it) } }
            launch { tasks.refresh() }
        }
        widgets.refreshNow()
        return true
    }

    /** Refetches what's on screen (Realtime (re)connect: changes may have been missed). */
    suspend fun syncVisible() {
        if (session.currentSession == null) return
        coroutineScope {
            windowsToSync().forEach { launch { events.refreshWindow(it) } }
            launch { tasks.refresh() }
            launch { workspace.refresh() }
        }
        widgets.requestRefresh()
    }

    /** Today ±7 days (what the widgets show) and the agenda's window when it lies elsewhere. */
    private fun windowsToSync(): List<TimeWindow> {
        val today = SyncWindows.aroundToday(clock)
        val visible = visibleWindow.window.value
        return if (visible == null || (visible.start >= today.start && visible.end <= today.end)) {
            listOf(today)
        } else {
            listOf(today, visible)
        }
    }
}
