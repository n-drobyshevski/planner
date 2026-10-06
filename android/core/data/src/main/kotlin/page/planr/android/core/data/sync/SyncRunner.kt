package page.planr.android.core.data.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
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
     * all tasks and the member's view settings; then re-renders widgets
     * (only those that [follow the clock][WidgetRefresher.followsClock] when
     * nothing changed). Returns false when signed out.
     * Throws on network / server errors (the worker retries). Always fetches
     * (forced): it runs on a schedule or because someone asked for it.
     */
    suspend fun syncAll(): Boolean {
        // A worker may start the process: wait for the stored session to load.
        session.authState.first { it != AuthState.Loading }
        if (session.currentSession == null) return false
        // Each refresh that changes the cache requests a redraw: one render,
        // awaited (a worker's process may end right after), covers them all.
        widgets.holding {
            val changed = coroutineScope {
                // Never fails the sync: a pending settings change retries next time
                // (and re-renders the widgets itself when it changes what they show).
                launch { appPrefs.pullQuietly() }
                refreshAll(force = true)
            }
            if (changed) widgets.refreshNow() else widgets.refreshClockBound()
        }
        return true
    }

    /**
     * Refetches what's on screen (Realtime (re)connect: changes may have been
     * missed). Joins the same refreshes already running, or skips those done
     * moments ago, unless they began before the join outdated them
     * ([page.planr.android.core.data.local.CacheGate.outdateSnapshots]).
     * A refresh that changed the cache redraws the widgets itself, whoever
     * led it (a screen opening may have written the change just before).
     */
    suspend fun syncVisible() {
        if (session.currentSession == null) return
        val changed = coroutineScope {
            launch { appPrefs.pullQuietly(force = false) }
            refreshAll(force = false)
        }
        if (!changed) widgets.refreshClockBound()
    }

    /**
     * Nothing to fetch (the app is open with Realtime joined, see
     * [SyncWorker]): only what moves with the clock is brought up to date.
     */
    suspend fun catchUpClock() {
        widgets.refreshClockBound()
    }

    /** Workspace, windows and tasks in parallel; whether any of them changed the cache. */
    private suspend fun refreshAll(force: Boolean): Boolean = coroutineScope {
        val windows = windowsToSync().map { async { events.refreshWindow(it, force) } }
        val rest = listOf(async { workspace.refresh(force) }, async { tasks.refresh(force) })
        (windows + rest).awaitAll().any { it }
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
