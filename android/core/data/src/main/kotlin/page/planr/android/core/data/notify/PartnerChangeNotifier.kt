package page.planr.android.core.data.notify

import android.content.Context
import android.content.res.Resources
import dagger.Lazy
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.data.R
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.sync.EventChangeObserver
import page.planr.android.core.data.sync.RowGone
import page.planr.android.core.model.PlannerEvent

/**
 * The "Partner's changes" notification for [PartnerChange]s, in the
 * viewer's zone. One change is titled with the partner's name, the change
 * its text ("Anna" / "Moved Dinner to Thu 8 Oct, 19:30"), so a long one
 * wraps when expanded instead of being cut off in the one-line title;
 * several are "3 changes from Anna" listing up to five. Tapping opens the
 * agenda on the first change's day.
 */
class PartnerChangeDigest(private val res: Resources, private val formats: WhenFormats) {

    @Inject
    constructor(@ApplicationContext context: Context, formats: DeviceWhenFormats) : this(context.resources, formats)

    /** [partnerName] null: "Your partner". [id] is the notification's. */
    fun content(partnerName: String?, changes: List<PartnerChange>, zone: TimeZone, id: Int): NotifyContent {
        require(changes.isNotEmpty())
        val name = partnerName?.trim()?.takeIf { it.isNotEmpty() } ?: res.getString(R.string.notify_partner_someone)
        val target = NotifyTarget.Day(dayOf(changes.first().start, changes.first().allDay, zone))
        val lines = changes.map { line(it, zone) }
        if (changes.size == 1) {
            return NotifyContent(NotifyChannel.PartnerChanges, id, title = name, text = lines.single(), target = target)
        }
        return NotifyContent(
            channel = NotifyChannel.PartnerChanges,
            id = id,
            title = res.getQuantityString(R.plurals.notify_partner_title, changes.size, changes.size, name),
            text = lines.first(),
            lines = lines.take(MAX_LINES),
            more = (lines.size - MAX_LINES).coerceAtLeast(0),
            target = target,
        )
    }

    /** "Moved Dinner to 19:30": a single change's text, or one row of the expanded list. */
    fun line(change: PartnerChange, zone: TimeZone): String = when (change.kind) {
        PartnerChange.Kind.Added -> res.getString(R.string.notify_partner_line_added, change.title, whenOf(change, zone))
        PartnerChange.Kind.Moved -> res.getString(R.string.notify_partner_line_moved, change.title, movedTo(change, zone))
        PartnerChange.Kind.Cancelled -> res.getString(R.string.notify_partner_line_cancelled, change.title, whenOf(change, zone))
        PartnerChange.Kind.Removed -> res.getString(R.string.notify_partner_line_removed, change.title, whenOf(change, zone))
    }

    /** "Thu 8 Oct, 18:00"; an all-day event's day alone. */
    private fun whenOf(change: PartnerChange, zone: TimeZone): String =
        if (change.allDay) formats.day(dayOf(change.start, allDay = true, zone)) else formats.moment(change.start, zone)

    /** The new time alone when it stays on the same day ("19:30"), else day and time. */
    private fun movedTo(change: PartnerChange, zone: TimeZone): String {
        val previous = change.previousStart
        if (change.allDay || previous == null) return whenOf(change, zone)
        val to = change.start.toLocalDateTime(zone)
        return if (previous.toLocalDateTime(zone).date == to.date) formats.time(to.time) else formats.moment(change.start, zone)
    }

    /** The day an event is on: an all-day one's is its UTC date (they are anchored to UTC midnight). */
    private fun dayOf(start: Instant, allDay: Boolean, zone: TimeZone): LocalDate =
        start.toLocalDateTime(if (allDay) TimeZone.UTC else zone).date

    internal companion object {
        const val MAX_LINES = 5
    }
}

/**
 * Notifies what the partner changed in the next two days while "Partner's
 * changes" is on (Settings → Notifications). It hears the cache's event
 * changes ([EventChangeObserver]): a background sync's window refresh, and
 * Realtime upserts and deletes (the channel lingers a minute after the app
 * leaves the foreground). [PartnerChangeDetector] picks the partner's
 * changes; [PartnerChangeThrottle] posts at most one notification every two
 * minutes, holding the rest. Changes are dropped while the app is in the
 * foreground (they show live on screen), and so is what was held when it
 * comes back. What is held lives in memory only: should the process end
 * before it is posted, it is lost, never posted twice.
 */
@Singleton
class PartnerChangeNotifier @Inject constructor(
    private val prefs: NotifyPrefs,
    // Lazy: the audience reads the cache through repositories that report here.
    private val audience: Lazy<NotifyAudience>,
    private val port: NotificationPort,
    private val foreground: AppForeground,
    private val digest: PartnerChangeDigest,
    private val clock: Clock,
    @ApplicationScope private val scope: CoroutineScope,
) : EventChangeObserver {
    private val mutex = Mutex()
    private val throttle = PartnerChangeThrottle()
    /** Null until the setting is read: listening meanwhile, [report] reads it again anyway. */
    private val enabled: StateFlow<Boolean?> = prefs.partnerChanges.stateIn(scope, SharingStarted.Eagerly, null)

    override val listening: Boolean get() = enabled.value != false && !foreground.isForeground()

    /**
     * What the cache told, judged one at a time in the order it was told: the
     * application scope is multi-threaded, so a launch per change could let a
     * cancellation overtake the move before it.
     */
    private val heard = Channel<(PartnerScope) -> List<PartnerChange>>(Channel.UNLIMITED)

    init {
        scope.launch { for (detect in heard) reportQuietly(detect) }
    }

    override fun eventsChanged(changes: List<Pair<PlannerEvent?, PlannerEvent>>) {
        if (!listening) return
        heard.trySend { s -> changes.mapNotNull { (before, after) -> PartnerChangeDetector.changed(before, after, s) } }
    }

    override fun eventGone(before: PlannerEvent?, gone: RowGone) {
        if (!listening) return
        heard.trySend { s -> listOfNotNull(PartnerChangeDetector.removed(before, gone, s)) }
    }

    /** Detects with [detect] (in the viewer's [PartnerScope]) and posts or holds what it finds. */
    suspend fun report(detect: (PartnerScope) -> List<PartnerChange>) = mutex.withLock {
        if (foreground.isForeground()) {
            throttle.clear()
            return@withLock
        }
        val since = prefs.partnerChangesSince() ?: return@withLock
        val viewer = audience.get().viewer() ?: return@withLock
        val partnerId = viewer.partnerId ?: return@withLock
        val now = clock.now()
        val found = detect(PartnerScope(viewer.memberId, partnerId, viewer.sleepCategoryId, now, since))
        when (val offer = throttle.offer(found, now)) {
            is PartnerChangeThrottle.Offer.Post -> post(offer.changes, viewer, now)
            is PartnerChangeThrottle.Offer.WaitUntil -> scope.launch {
                delay(offer.at - now)
                flushQuietly()
            }
            PartnerChangeThrottle.Offer.Held -> Unit
        }
    }

    /** Posts what was held, once the interval since the last post has passed. */
    suspend fun flush() = mutex.withLock {
        if (foreground.isForeground() || prefs.partnerChangesSince() == null) {
            throttle.clear()
            return@withLock
        }
        val now = clock.now()
        val due = throttle.due(now)
        if (due.isEmpty()) return@withLock
        val viewer = audience.get().viewer() ?: return@withLock
        post(due, viewer, now)
    }

    /** Sign-out: drop what is held and take down what is showing. */
    suspend fun clearLocal() {
        mutex.withLock { throttle.clear() }
        port.cancelAll(NotifyChannel.PartnerChanges)
    }

    private fun post(changes: List<PartnerChange>, viewer: NotifyViewer, now: Instant) {
        if (changes.isEmpty() || !port.canPost(NotifyChannel.PartnerChanges)) return
        port.ensureChannel(NotifyChannel.PartnerChanges)
        // Its own id per post: a newer digest never replaces one not yet read.
        port.post(digest.content(viewer.partnerName, changes, viewer.zone, id = "partner@${now.toEpochMilliseconds()}".hashCode()))
    }

    private suspend fun reportQuietly(detect: (PartnerScope) -> List<PartnerChange>) {
        try {
            report(detect)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // A storage hiccup: this change goes unnoticed, the cache itself is right.
        }
    }

    private suspend fun flushQuietly() {
        try {
            flush()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // As above.
        }
    }
}
