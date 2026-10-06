package page.planr.android.feature.inbox

import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.inbox.InboxInput
import page.planr.android.core.data.inbox.InboxItem
import page.planr.android.core.data.inbox.InboxRules
import page.planr.android.core.data.inbox.NightWindow
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.model.viewerTimeZone
import page.planr.android.feature.inbox.data.InboxDataSource
import page.planr.android.feature.inbox.data.InboxViewer

/** The Inbox's rows at one moment, and what they were derived against. */
internal data class InboxSnapshot(
    val viewer: InboxViewer,
    val items: List<InboxItem>,
    val zone: TimeZone,
    val now: Instant,
    /** The viewer's nights, for the rating sheet's prefill. */
    val logs: List<SleepLog>,
)

/** Emits now, then on every wall-clock minute, so time-gated rows come and go on their own. */
internal fun minuteTicks(clock: Clock): Flow<Instant> = flow {
    while (true) {
        val now = clock.now()
        emit(now)
        delay(MINUTE_MS - now.toEpochMilliseconds() % MINUTE_MS)
    }
}

/**
 * The viewer's night window, or the DB defaults when it can't be read
 * (offline, or a network too slow to answer within [NIGHT_WINDOW_BUDGET]):
 * every row waits for it, so a stalled read must not hold the count back.
 */
internal fun InboxDataSource.nightWindowOrDefault(): Flow<NightWindow> = flow {
    val window = try {
        withTimeoutOrNull(NIGHT_WINDOW_BUDGET) { nightWindow() } ?: NightWindow.DEFAULT
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        NightWindow.DEFAULT
    }
    emit(window)
}

/**
 * The rows [InboxRules.derive] makes of what Room and the in-memory caches
 * hold (use-inbox.ts `useInboxItems`); null while signed out. A pure reader:
 * nothing here fetches. Until the nights are read the sleep rows are left
 * out, rather than asking about every recent morning.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal fun InboxDataSource.snapshots(minutes: Flow<Instant>, nightWindow: Flow<NightWindow>): Flow<InboxSnapshot?> =
    viewer.flatMapLatest { viewer ->
        if (viewer == null) return@flatMapLatest flowOf(null)
        val zone = observeMembers()
            .map { members -> viewerTimeZone(members.firstOrNull { it.id == viewer.memberId }) }
            .distinctUntilChanged()
        val moment = combine(minutes, zone) { now, z -> now to z }
        val occurrences = moment
            .map { (now, z) -> InboxRules.occurrenceWindow(now, z) to z }
            .distinctUntilChanged()
            .flatMapLatest { (window, z) -> observeOccurrences(window, z) }
        val rest = combine(observeTasks(), sleepLogs, requests) { tasks, logs, requests -> Triple(tasks, logs, requests) }
        combine(moment, occurrences, rest, nightWindow) { (now, z), occurrences, (tasks, logs, requests), night ->
            val input = InboxInput(
                occurrences = occurrences,
                tasks = tasks,
                sleepLogDates = logs.orEmpty().filter { it.isRated }.map { it.date }.toSet(),
                requests = requests.orEmpty(),
                viewerId = viewer.memberId,
                now = now,
                zone = z,
                nightWindow = night,
                sleepWindowDays = if (logs == null) 0 else InboxRules.SLEEP_N,
            )
            InboxSnapshot(viewer, InboxRules.derive(input), z, now, logs.orEmpty())
        }
    }

private const val MINUTE_MS = 60_000L

/** As long as the reminders wait for the same read (CacheReminderSource). */
internal val NIGHT_WINDOW_BUDGET = 5.seconds
