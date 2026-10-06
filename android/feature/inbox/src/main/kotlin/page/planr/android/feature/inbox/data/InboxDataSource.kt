package page.planr.android.feature.inbox.data

import kotlinx.coroutines.flow.Flow
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

/** Who is looking: the signed-in member and their workspace. */
data class InboxViewer(val memberId: String, val workspaceId: String)

/** What the Inbox reads and writes; tests swap in a fake. */
interface InboxDataSource {
    /** null while signed out. */
    val viewer: Flow<InboxViewer?>

    fun observeMembers(): Flow<List<Member>>

    /** The whole workspace, top-level and subtasks, from Room. */
    fun observeTasks(): Flow<List<Task>>

    /** Expanded occurrences overlapping [window] from Room. Must not mark the agenda's visible window. */
    fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>>

    /** The viewer's recent nights; null until first read. */
    val sleepLogs: Flow<List<SleepLog>?>

    /** The viewer's pending timeslot requests; null until first read. */
    val requests: Flow<List<TimeslotRequest>?>

    /** Fetches [window] into Room. */
    suspend fun refreshWindow(window: TimeWindow)

    suspend fun refreshTasks()

    /** The viewer's recent nights; with [force] off, skipped when read moments ago. */
    suspend fun refreshSleep(force: Boolean = true)

    /** The pending requests; with [force] off, skipped when read moments ago. */
    suspend fun refreshRequests(force: Boolean = true)

    /** The viewer's night window (`member_sleep_prefs`), read from the server. */
    suspend fun nightWindow(): NightWindow

    /** Writes [attributes] (satisfaction merged in) to the event's master row. */
    suspend fun rateEvent(eventId: String, attributes: JsonObject)

    suspend fun rateTask(taskId: String, attributes: JsonObject)

    suspend fun saveSleep(rating: SleepRating): SleepLog

    /**
     * Creates [draft] as the event [id], at most once: when it already exists
     * (an earlier attempt landed), nothing is created again.
     */
    suspend fun createEvent(id: String, draft: PlannerEventDraft)

    suspend fun markApproved(requestId: String)

    suspend fun markDeclined(requestId: String)
}
