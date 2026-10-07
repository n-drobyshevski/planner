package page.planr.android.core.data.notify

import android.content.Context
import android.content.res.Resources
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.R
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.data.model.TimeslotRequestStatus
import page.planr.android.core.data.repository.TimeslotRequestRepository

/**
 * Which pending timeslot requests are new, against those already seen.
 * Pure, so it is unit-tested directly; [NewRequestNotifier] runs it.
 */
object NewRequestsPlanner {
    /**
     * At most this many requests are kept seen (the newest). Older pending
     * ones are left out of every plan altogether, so they never notify late.
     */
    const val SEEN_CAP = 200

    data class Plan(
        /** Newest first. */
        val toNotify: List<TimeslotRequest>,
        /** The pending requests now accounted for: those no longer pending are pruned. */
        val newSeen: Set<String>,
    )

    /**
     * [since]: when notifying was turned on (null: unknown). A request made
     * before it is never new, even when it is missing from [seen] because
     * the first check primed from a list fetched before it arrived.
     */
    fun plan(pending: List<TimeslotRequest>, seen: Set<String>, since: Instant? = null): Plan {
        val considered = considered(pending)
        return Plan(
            toNotify = considered.filter { it.id !in seen && (since == null || it.createdAt > since) },
            newSeen = considered.mapTo(LinkedHashSet()) { it.id },
        )
    }

    /** The first check after turning notifications on: everything pending is seen, nothing notifies. */
    fun prime(pending: List<TimeslotRequest>): Set<String> = considered(pending).mapTo(LinkedHashSet()) { it.id }

    private fun considered(pending: List<TimeslotRequest>): List<TimeslotRequest> =
        pending
            .filter { it.status == TimeslotRequestStatus.Pending }
            .sortedWith(compareByDescending<TimeslotRequest> { it.createdAt }.thenBy { it.id })
            .take(SEEN_CAP)
}

/**
 * The "Time requests" notification: one for a single new request ("New
 * time request", "Anna asked for Tue 7 Oct, 14:00–15:00"), else one summary
 * ("3 new time requests") listing up to five. Tapping opens the Inbox.
 * Every post has its own id, so a later batch alerts again and leaves an
 * earlier one, still unread, showing.
 */
class NewRequestTexts(private val res: Resources, private val formats: WhenFormats) {

    @Inject
    constructor(@ApplicationContext context: Context, formats: DeviceWhenFormats) : this(context.resources, formats)

    /** [requests] newest first, as [NewRequestsPlanner.Plan.toNotify] lists them. */
    fun content(requests: List<TimeslotRequest>, zone: TimeZone): NotifyContent {
        require(requests.isNotEmpty())
        val lines = requests.map { line(it, zone) }
        if (requests.size == 1) {
            return NotifyContent(
                channel = NotifyChannel.TimeRequests,
                id = requests.single().id.hashCode(),
                title = res.getString(R.string.notify_request_title),
                text = lines.single(),
                target = NotifyTarget.Inbox,
            )
        }
        return NotifyContent(
            channel = NotifyChannel.TimeRequests,
            id = summaryId(requests.first()),
            title = res.getQuantityString(R.plurals.notify_requests_title, requests.size, requests.size),
            text = lines.first(),
            lines = lines.take(MAX_LINES),
            more = (lines.size - MAX_LINES).coerceAtLeast(0),
            target = NotifyTarget.Inbox,
        )
    }

    /** "Anna asked for Tue 7 Oct, 14:00–15:00"; "Someone asked for …" when they left no name. */
    fun line(request: TimeslotRequest, zone: TimeZone): String {
        val slot = formats.slot(request.proposedStart, request.proposedEnd, zone)
        val name = request.requesterName?.trim()?.takeIf { it.isNotEmpty() }
        return if (name != null) {
            res.getString(R.string.notify_request_named, name, slot)
        } else {
            res.getString(R.string.notify_request_anonymous, slot)
        }
    }

    internal companion object {
        const val MAX_LINES = 5

        /**
         * A summary's id, from its newest request: that one is new to this
         * batch alone (seen from then on), so no two summaries share it. A
         * single request's id is its own id's hash.
         */
        fun summaryId(newest: TimeslotRequest): Int = "requests@${newest.id}".hashCode()
    }
}

/**
 * Notifies new public-share timeslot requests while "New time requests" is
 * on (Settings → Notifications). It follows the Inbox's own list
 * ([TimeslotRequestRepository.pending]), which Realtime refreshes in the
 * foreground (`timeslot_requests` changes, see
 * [page.planr.android.core.data.sync.RealtimeSync]) and the periodic sync
 * in the background ([checkInBackground]). Every request seen is
 * remembered ([NotifyPrefs.seenRequests]), so each notifies once, and the
 * first check after turning it on marks the backlog seen without
 * notifying; a request made before it was turned on never notifies, even
 * when that first check saw an older cached list ([NotifyPrefs.newRequestsSince]). Nothing is notified while the app is in the foreground (the
 * account button's badge shows it), though what arrived is marked seen.
 */
@Singleton
class NewRequestNotifier @Inject constructor(
    private val prefs: NotifyPrefs,
    private val requests: TimeslotRequestRepository,
    private val audience: NotifyAudience,
    private val port: NotificationPort,
    private val foreground: AppForeground,
    private val texts: NewRequestTexts,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private val mutex = Mutex()
    private var started = false

    /** Call once from Application.onCreate. */
    fun start() {
        if (started) return
        started = true
        scope.launch {
            prefs.newRequests.collectLatest { on ->
                if (!on) return@collectLatest
                // From the moment it is on, so the channel's settings are reachable.
                port.ensureChannel(NotifyChannel.TimeRequests)
                refreshQuietly()
                requests.pending.filterNotNull().collect { checkQuietly(it) }
            }
        }
    }

    /** After the periodic sync: fetches the pending requests (unless done moments ago) and checks them. */
    suspend fun checkInBackground() {
        if (!prefs.newRequests.first()) return
        refreshQuietly()
        requests.pending.first()?.let { check(it) }
    }

    /** Checks [pending] against the requests seen; see the class doc. */
    suspend fun check(pending: List<TimeslotRequest>) = mutex.withLock {
        if (!prefs.newRequests.first()) return@withLock
        val seen = prefs.seenRequests()
        if (seen == null) {
            prefs.setSeenRequests(NewRequestsPlanner.prime(pending))
            return@withLock
        }
        val plan = NewRequestsPlanner.plan(pending, seen, prefs.newRequestsSince())
        if (plan.newSeen != seen) prefs.setSeenRequests(plan.newSeen)
        if (plan.toNotify.isEmpty() || foreground.isForeground() || !port.canPost(NotifyChannel.TimeRequests)) return@withLock
        val viewer = audience.viewer() ?: return@withLock
        port.ensureChannel(NotifyChannel.TimeRequests)
        port.post(texts.content(plan.toNotify, viewer.zone))
    }

    /** Sign-out: forget what was seen and take down what is showing. */
    suspend fun clearLocal() {
        mutex.withLock { prefs.clearMember() }
        port.cancelAll(NotifyChannel.TimeRequests)
    }

    private suspend fun refreshQuietly() {
        try {
            requests.refresh(force = false)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Offline: the next sync or Realtime change checks again.
        }
    }

    private suspend fun checkQuietly(pending: List<TimeslotRequest>) {
        try {
            check(pending)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // A storage hiccup: the next change checks again.
        }
    }
}
