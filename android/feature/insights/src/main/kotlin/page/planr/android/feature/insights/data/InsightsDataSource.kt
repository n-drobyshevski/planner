package page.planr.android.feature.insights.data

import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.prefs.InsightsFilterPrefs
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task
import page.planr.android.core.model.TimeWindow

/** What the Insights screen reads and writes; tests swap in a fake. */
interface InsightsDataSource {
    /** Signed-in member id; null while signed out. */
    val currentMemberId: Flow<String?>

    fun observeMembers(): Flow<List<Member>>

    /** In sort_order, as cached. */
    fun observeCategories(): Flow<List<Category>>

    /** The whole workspace; the ViewModel slices it to the viewer. */
    fun observeTasks(): Flow<List<Task>>

    /** Expanded occurrences overlapping [window] from Room. Must NOT mark VisibleWindowTracker. */
    fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>>

    /** Fetches [window] into Room (EventRepository.refreshWindow); skipped when just fetched, unless [force]d. */
    suspend fun refreshWindow(window: TimeWindow, force: Boolean = false)

    /** Workspace bundle + tasks (pull-to-refresh only, so always forced). */
    suspend fun refreshReference()

    fun observeFilters(viewerId: String): Flow<InsightsFilterPrefs>

    suspend fun setHiddenCategories(viewerId: String, ids: Set<String>)

    suspend fun setIncludeInactive(viewerId: String, include: Boolean)
}
