package page.planr.android.core.data.repository

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.local.PlanrDatabase
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.sync.VisibleWindowTracker
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.RecurrenceExpander

/**
 * Calendar occurrences for a window: Room's events + overrides (the
 * `fetchWindow` predicate) expanded by [RecurrenceExpander] — the same
 * pipeline as the web's `useWindowEvents` + `expandEvents`. Re-emits whenever
 * Room changes (writes, Realtime, background sync).
 */
@Singleton
class OccurrenceRepository @Inject constructor(
    private val session: SessionManager,
    private val db: PlanrDatabase,
    private val expander: RecurrenceExpander,
    private val visibleWindow: VisibleWindowTracker,
    private val events: EventRepository,
) {

    /**
     * Occurrences overlapping [window], sorted by start. Collecting marks
     * [window] as the one on screen, so a Realtime reconnect refetches it.
     * Call [refresh] (e.g. on open / pull-to-refresh) to fetch it from Supabase.
     */
    fun observeOccurrences(
        window: TimeWindow,
        viewerZone: TimeZone = TimeZone.currentSystemDefault(),
    ): Flow<List<Occurrence>> = occurrences(window, viewerZone).onStart { visibleWindow.show(window) }

    /**
     * Like [observeOccurrences] but does NOT mark [window] as the one on screen:
     * Insights reads long background windows (current + previous period) that
     * a Realtime reconnect should not refetch.
     */
    fun observeUntracked(window: TimeWindow, viewerZone: TimeZone): Flow<List<Occurrence>> =
        occurrences(window, viewerZone)

    /** One-shot read from Room, for widgets (does not touch the visible window). */
    suspend fun snapshot(
        window: TimeWindow,
        viewerZone: TimeZone = TimeZone.currentSystemDefault(),
    ): List<Occurrence> = occurrences(window, viewerZone).first()

    /**
     * Fetches [window] from Supabase into Room; the flows above update on
     * their own. Skipped when the same window was just fetched, unless [force]d.
     */
    suspend fun refresh(window: TimeWindow, force: Boolean = false) = events.refreshWindow(window, force)

    private fun occurrences(window: TimeWindow, viewerZone: TimeZone): Flow<List<Occurrence>> {
        val start = window.start.toEpochMilliseconds()
        val end = window.end.toEpochMilliseconds()
        return session.inWorkspace(emptyList()) { ws ->
            val dao = db.eventDao()
            val sharedCategoryIds = db.workspaceDao().observeCategories(ws)
                .map { rows -> rows.filter { it.ownerId == null }.map { it.id }.toSet() }
            combine(
                dao.observeWindow(ws, start, end),
                dao.observeOverridesInWindow(ws, start, end),
                sharedCategoryIds,
            ) { eventRows, overrideRows, shared ->
                expander.expand(
                    events = eventRows.map { it.toModel() },
                    overrides = overrideRows.map { it.toModel() },
                    window = window,
                    viewerZone = viewerZone,
                    sharedCategoryIds = shared,
                )
            }
        }.flowOn(Dispatchers.Default)
    }
}
