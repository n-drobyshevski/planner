package page.planr.android.feature.insights.data

import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.prefs.InsightsFilterPrefs
import page.planr.android.core.data.prefs.InsightsPreferences
import page.planr.android.core.data.repository.OccurrenceRepository
import page.planr.android.core.data.repository.TaskRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task
import page.planr.android.core.model.TimeWindow

/**
 * The production [InsightsDataSource]: the Room-backed repositories, the
 * session and the per-viewer filter preferences. It never reads
 * `ViewPreferences`: Insights ignores the agenda's partner toggle.
 */
class RepositoryInsightsDataSource @Inject constructor(
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val tasks: TaskRepository,
    private val occurrences: OccurrenceRepository,
    private val preferences: InsightsPreferences,
) : InsightsDataSource {

    override val currentMemberId: Flow<String?> =
        session.authState.map { (it as? AuthState.SignedIn)?.session?.memberId }.distinctUntilChanged()

    override fun observeMembers(): Flow<List<Member>> = workspace.observeMembers()

    override fun observeCategories(): Flow<List<Category>> = workspace.observeCategories()

    override fun observeTasks(): Flow<List<Task>> = tasks.observeTasks()

    /** Untracked: Insights' long background windows must not become the agenda's "on screen" window. */
    override fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>> =
        occurrences.observeUntracked(window, zone)

    override suspend fun refreshWindow(window: TimeWindow, force: Boolean) {
        occurrences.refresh(window, force)
    }

    override suspend fun refreshReference() = coroutineScope {
        val bundle = async { workspace.refresh(force = true) }
        val rows = async { tasks.refresh(force = true) }
        bundle.await()
        rows.await()
        Unit
    }

    override fun observeFilters(viewerId: String): Flow<InsightsFilterPrefs> = preferences.filters(viewerId)

    override suspend fun setHiddenCategories(viewerId: String, ids: Set<String>) =
        preferences.setHiddenCategories(viewerId, ids)

    override suspend fun setIncludeInactive(viewerId: String, include: Boolean) =
        preferences.setIncludeInactive(viewerId, include)
}
