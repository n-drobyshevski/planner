package page.planr.android.feature.inbox.data

import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.inbox.NightWindow
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRating
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.data.repository.EventRepository
import page.planr.android.core.data.repository.OccurrenceRepository
import page.planr.android.core.data.repository.SleepLogRepository
import page.planr.android.core.data.repository.SleepPrefsRepository
import page.planr.android.core.data.repository.TaskRepository
import page.planr.android.core.data.repository.TimeslotRequestRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.Task
import page.planr.android.core.model.TimeWindow

/**
 * The production [InboxDataSource]: the Room-backed events and tasks, the
 * in-memory sleep nights and timeslot requests, and the existing event /
 * task update paths for ratings.
 */
class RepositoryInboxDataSource @Inject constructor(
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val tasks: TaskRepository,
    private val events: EventRepository,
    private val occurrences: OccurrenceRepository,
    private val sleep: SleepLogRepository,
    private val sleepPrefs: SleepPrefsRepository,
    private val timeslots: TimeslotRequestRepository,
) : InboxDataSource {

    override val viewer: Flow<InboxViewer?> = session.authState
        .map { state -> (state as? AuthState.SignedIn)?.session?.let { InboxViewer(it.memberId, it.workspaceId) } }
        .distinctUntilChanged()

    override fun observeMembers(): Flow<List<Member>> = workspace.observeMembers()

    override fun observeTasks(): Flow<List<Task>> = tasks.observeTasks()

    /** Untracked: the Inbox's trailing days must not become the agenda's "on screen" window. */
    override fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>> =
        occurrences.observeUntracked(window, zone)

    override val sleepLogs: Flow<List<SleepLog>?> = sleep.recentLogs

    override val requests: Flow<List<TimeslotRequest>?> = timeslots.pending

    override suspend fun refreshWindow(window: TimeWindow) {
        occurrences.refresh(window)
    }

    override suspend fun refreshTasks() {
        tasks.refresh()
    }

    override suspend fun refreshSleep(force: Boolean) = sleep.refresh(force)

    override suspend fun refreshRequests(force: Boolean) = timeslots.refresh(force)

    override suspend fun nightWindow(): NightWindow =
        sleepPrefs.fetch().let { NightWindow(it.nightWindowStartHour, it.nightWindowEndHour) }

    override suspend fun rateEvent(eventId: String, rate: (JsonObject) -> JsonObject) {
        events.updateAttributes(eventId, rate)
    }

    override suspend fun rateTask(taskId: String, rate: (JsonObject) -> JsonObject) {
        tasks.updateAttributes(taskId, rate)
    }

    override suspend fun saveSleep(rating: SleepRating): SleepLog = sleep.save(rating)

    override suspend fun createEvent(id: String, draft: PlannerEventDraft) {
        events.createEventOnce(id, draft)
    }

    override suspend fun markApproved(requestId: String) = timeslots.markApproved(requestId)

    override suspend fun markDeclined(requestId: String) = timeslots.markDeclined(requestId)
}
