package page.planr.android.feature.inbox

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.inbox.NightWindow
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRating
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.Task
import page.planr.android.core.model.TimeWindow
import page.planr.android.feature.inbox.data.InboxDataSource
import page.planr.android.feature.inbox.data.InboxViewer

/**
 * An in-memory [InboxDataSource]. Reads come from the flows; refreshes copy
 * the "server" lists in; writes are recorded and, when they succeed, change
 * the data the way Room and the caches would. A [hold] keeps every write
 * suspended until it completes, so a test can look at the optimistic state.
 */
class FakeInboxDataSource(zone: String = "Europe/Berlin") : InboxDataSource {
    override val viewer = MutableStateFlow<InboxViewer?>(InboxViewer(ME, WS))
    val members = MutableStateFlow(listOf(Member(id = ME, workspaceId = WS, name = "Anna", color = "#c0492a", timezone = zone)))
    val tasks = MutableStateFlow<List<Task>>(emptyList())
    val occurrences = MutableStateFlow<List<Occurrence>>(emptyList())
    override val sleepLogs = MutableStateFlow<List<SleepLog>?>(null)
    override val requests = MutableStateFlow<List<TimeslotRequest>?>(null)

    /** What the server holds; a refresh copies it into the flows. */
    var serverLogs: List<SleepLog> = emptyList()
    var serverRequests: List<TimeslotRequest> = emptyList()
    var night: NightWindow = NightWindow.DEFAULT

    /** When set, the night window read never answers (a stalled network). */
    var stallNightWindow = false

    val refreshedWindows = mutableListOf<TimeWindow>()
    var requestRefreshes = 0
    var sleepRefreshes = 0
    /** The `force` of each requests / sleep refresh, in order. */
    val refreshForces = mutableListOf<Boolean>()
    var failRefresh: Exception? = null

    val ratedEvents = mutableListOf<Pair<String, JsonObject>>()
    val ratedTasks = mutableListOf<Pair<String, JsonObject>>()
    val created = mutableListOf<PlannerEventDraft>()
    val approved = mutableListOf<String>()
    val declined = mutableListOf<String>()
    val savedSleep = mutableListOf<SleepRating>()

    var failRate: Exception? = null
    var failCreate: Exception? = null
    var failApprove: Exception? = null
    var failDecline: Exception? = null
    var failSave: Exception? = null

    /** When set, every write waits for it. */
    var hold: CompletableDeferred<Unit>? = null

    override fun observeMembers(): Flow<List<Member>> = members

    override fun observeTasks(): Flow<List<Task>> = tasks

    override fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>> =
        occurrences.map { list -> list.filter { window.intersects(it.start, it.end) } }

    override suspend fun refreshWindow(window: TimeWindow) {
        failRefresh?.let { throw it }
        refreshedWindows += window
    }

    override suspend fun refreshTasks() {
        failRefresh?.let { throw it }
    }

    override suspend fun refreshSleep(force: Boolean) {
        sleepRefreshes++
        refreshForces += force
        failRefresh?.let { throw it }
        sleepLogs.value = serverLogs
    }

    override suspend fun refreshRequests(force: Boolean) {
        requestRefreshes++
        refreshForces += force
        failRefresh?.let { throw it }
        requests.value = serverRequests
    }

    override suspend fun nightWindow(): NightWindow {
        if (stallNightWindow) awaitCancellation()
        return night
    }

    override suspend fun rateEvent(eventId: String, attributes: JsonObject) {
        hold?.await()
        failRate?.let { throw it }
        ratedEvents += eventId to attributes
        occurrences.update { list -> list.map { if (it.eventId == eventId) it.copy(attributes = attributes) else it } }
    }

    override suspend fun rateTask(taskId: String, attributes: JsonObject) {
        hold?.await()
        failRate?.let { throw it }
        ratedTasks += taskId to attributes
        tasks.update { list -> list.map { if (it.id == taskId) it.copy(attributes = attributes) else it } }
    }

    override suspend fun saveSleep(rating: SleepRating): SleepLog {
        hold?.await()
        failSave?.let { throw it }
        savedSleep += rating
        val log = SleepLog(rating.date, quality = rating.quality, fatigue = rating.fatigue, note = rating.note)
        serverLogs = serverLogs.filterNot { it.date == rating.date } + log
        sleepLogs.value = serverLogs
        return log
    }

    override suspend fun createEvent(draft: PlannerEventDraft) {
        hold?.await()
        failCreate?.let { throw it }
        created += draft
    }

    override suspend fun markApproved(requestId: String) {
        hold?.await()
        failApprove?.let { throw it }
        approved += requestId
        drop(requestId)
    }

    override suspend fun markDeclined(requestId: String) {
        hold?.await()
        failDecline?.let { throw it }
        declined += requestId
        drop(requestId)
    }

    private fun drop(requestId: String) {
        serverRequests = serverRequests.filterNot { it.id == requestId }
        requests.update { list -> list?.filterNot { it.id == requestId } }
    }

    companion object {
        const val ME = "me"
        const val PARTNER = "partner"
        const val WS = "ws"
    }
}
