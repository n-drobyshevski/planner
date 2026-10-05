package page.planr.android.core.data.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.prefs.AppPrefsSync
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
    private val appPrefs: AppPrefsSync,
    private val clock: Clock,
) {

    /**
     * Members/categories/boards, the widgets' days (plus the visible window),
     * all tasks and the member's view settings; then re-renders widgets. Returns false when signed out.
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
            // Never fails the sync: a pending settings change retries next time.
            launch { appPrefs.pullQuietly() }
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
            launch { appPrefs.pullQuietly() }
        }
        widgets.requestRefresh()
    }

    /** The widgets' days ([SyncWindows.aroundToday]) and the agenda's window when it lies elsewhere. */
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
