package page.planr.android.feature.insights

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.prefs.InsightsFilterPrefs
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task
import page.planr.android.core.model.TimeWindow
import page.planr.android.feature.insights.data.InsightsDataSource

/**
 * In-memory [InsightsDataSource]: seeded occurrences are served per window by
 * overlap, refreshes are recorded (and can be held or failed), filters live per viewer.
 */
class FakeInsightsDataSource(
    memberId: String? = ANNA,
    members: List<Member> = listOf(anna, boris),
    categories: List<Category> = listOf(sharedHome, annaWork),
    tasks: List<Task> = emptyList(),
    occurrences: List<Occurrence> = emptyList(),
) : InsightsDataSource {
    val memberId = MutableStateFlow(memberId)
    val members = MutableStateFlow(members)
    val categories = MutableStateFlow(categories)
    val tasks = MutableStateFlow(tasks)
    val occurrences = MutableStateFlow(occurrences)
    val filters = MutableStateFlow<Map<String, InsightsFilterPrefs>>(emptyMap())

    /** Every window passed to [refreshWindow], in call order. */
    val refreshedWindows = mutableListOf<TimeWindow>()

    /** Every window passed to [observeOccurrences], in call order. */
    val observedWindows = mutableListOf<TimeWindow>()
    var referenceRefreshes = 0

    /** When set, refreshes throw it (after [refreshGate], if any). */
    var failRefreshWith: Throwable? = null

    /** When set, refreshes suspend until it completes. */
    var refreshGate: CompletableDeferred<Unit>? = null

    override val currentMemberId: Flow<String?> = this.memberId

    override fun observeMembers(): Flow<List<Member>> = members

    override fun observeCategories(): Flow<List<Category>> = categories

    override fun observeTasks(): Flow<List<Task>> = tasks

    override fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>> {
        observedWindows += window
        return occurrences.map { all -> all.filter { window.intersects(it.start, it.end) } }
    }

    override suspend fun refreshWindow(window: TimeWindow) {
        refreshedWindows += window
        refreshGate?.await()
        failRefreshWith?.let { throw it }
    }

    override suspend fun refreshReference() {
        referenceRefreshes++
        refreshGate?.await()
        failRefreshWith?.let { throw it }
    }

    override fun observeFilters(viewerId: String): Flow<InsightsFilterPrefs> =
        filters.map { it[viewerId] ?: InsightsFilterPrefs() }

    override suspend fun setHiddenCategories(viewerId: String, ids: Set<String>) {
        filters.update { it + (viewerId to (it[viewerId] ?: InsightsFilterPrefs()).copy(hiddenCategoryIds = ids)) }
    }

    override suspend fun setIncludeInactive(viewerId: String, include: Boolean) {
        filters.update { it + (viewerId to (it[viewerId] ?: InsightsFilterPrefs()).copy(includeInactive = include)) }
    }
}
