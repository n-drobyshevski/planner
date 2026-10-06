package page.planr.android.core.data.health

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionInfo
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.health.SleepBlockPlanner.toKotlin
import page.planr.android.core.data.remote.SleepDeviceRow
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.remote.SleepRemote
import page.planr.android.core.data.remote.SleepRemote.Companion.matches

/** The Health Connect DataStore (`planr_health`): per device, never synced. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class HealthPrefsDataStore

/** What the Health Connect sheet shows. */
data class HealthSleepStatus(
    /** connected on this device, for the signed-in member */
    val connected: Boolean = false,
    val lastSyncAt: Instant? = null,
    /** nights found in the last sync's window */
    val lastNights: Int? = null,
    val problem: HealthSyncProblem? = null,
)

enum class HealthSyncProblem {
    /** Health Connect access was withdrawn (in its settings, or it was reinstalled) */
    PermissionLost,
    /** offline or a server hiccup: the next foreground retries */
    Failed,
}

sealed interface HealthSyncResult {
    /** [blocks]: calendar sleep blocks created or moved to match the nights. */
    data class Synced(val nights: Int, val written: Int, val blocks: Int = 0) : HealthSyncResult
    data object NotConnected : HealthSyncResult
    data object Failed : HealthSyncResult
}

/**
 * Copies the member's sleep from Health Connect into `sleep_logs`, so the
 * web's Sleep tab fills in from their tracker.
 *
 * - **When:** right after connecting, on "Sync now", and when the app comes to
 *   the foreground if the last sync is older than [FOREGROUND_EVERY]. Never in
 *   the background: Health Connect only allows that with an extra permission.
 * - **What:** the first sync reads 30 days back (90 with the history
 *   permission); later ones re-read from [OVERLAP] before the last sync, so a
 *   tracker that uploads late is still caught. Only nights whose stored device
 *   columns differ are written.
 * - **Device times win:** an imported night overwrites typed bedtime / wake,
 *   never the member's ratings or note (see [SleepRemote]). Nights deleted in
 *   Health Connect stay, since the row may hold those ratings.
 * - **Calendar:** for the last [BLOCK_NIGHTS] nights whose times came in or
 *   changed, the night's sleep block is snapped to them, as a check-in on the
 *   web does (a one-off block moves, a routine gets a one-night exception, a
 *   missing one is created), unless the member turned that off. A block moved
 *   by hand afterwards stays put: only new device times move it again. A
 *   night whose block couldn't be snapped (offline halfway, the sync cut
 *   short) is remembered and retried on the next sync while it is still
 *   among those nights.
 * - **Zone:** the window, the recent nights and the blocks follow the
 *   member's profile zone, as the check-in card and the Sleep tab do; the
 *   device's when the profile has none.
 * - Connecting is per device and per member: after another member signs in on
 *   this phone, nothing syncs until they connect themselves.
 */
@Singleton
class HealthSleepSync @Inject constructor(
    private val source: HealthSleepSource,
    private val remote: SleepRemote,
    private val calendar: SleepBlockCalendar,
    private val memberZone: MemberZone,
    private val session: SessionManager,
    @HealthPrefsDataStore private val store: DataStore<Preferences>,
    private val clock: Clock,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private val mutex = Mutex()
    private var started = false

    /** The device zone, for a member whose profile has none ([zoneOf]); replaced in tests. */
    internal var zone: () -> ZoneId = ZoneId::systemDefault

    val status: Flow<HealthSleepStatus> = combine(
        store.data,
        session.authState.map { (it as? AuthState.SignedIn)?.session?.memberId },
    ) { prefs, memberId ->
        val connected = prefs[ENABLED] == true && memberId != null && prefs[MEMBER] == memberId
        HealthSleepStatus(
            connected = connected,
            lastSyncAt = prefs[LAST_SYNC]?.let(Instant::fromEpochMilliseconds),
            lastNights = prefs[LAST_NIGHTS],
            problem = prefs[PROBLEM]?.let { runCatching { HealthSyncProblem.valueOf(it) }.getOrNull() },
        )
    }.distinctUntilChanged()

    /** Syncs on every return to the foreground. Call once from Application.onCreate. */
    fun start(foreground: Flow<Boolean> = processForeground()) {
        if (started) return
        started = true
        scope.launch {
            foreground.distinctUntilChanged().collect { visible ->
                if (visible && due()) sync()
            }
        }
    }

    /** After Health Connect granted access: remember it for this member and sync. */
    suspend fun connect(): HealthSyncResult {
        val me = session.currentSession ?: return HealthSyncResult.NotConnected
        store.edit {
            it.clear()
            it[ENABLED] = true
            it[MEMBER] = me.memberId
        }
        return sync()
    }

    /** Stops syncing and withdraws the access. Nights already imported stay. */
    suspend fun disconnect() {
        store.edit { it.clear() }
        runCatching { source.revoke() }
    }

    /** Reads the window and writes the nights that changed. Never throws. */
    suspend fun sync(): HealthSyncResult = mutex.withLock {
        val me = session.currentSession ?: return@withLock HealthSyncResult.NotConnected
        val prefs = store.data.first()
        if (prefs[ENABLED] != true || prefs[MEMBER] != me.memberId) return@withLock HealthSyncResult.NotConnected
        if (source.availability() != HealthAvailability.Available) return@withLock HealthSyncResult.NotConnected
        try {
            if (!source.hasReadPermission()) return@withLock lost()
            val now = java.time.Instant.ofEpochMilli(clock.now().toEpochMilliseconds())
            val last = prefs[LAST_SYNC]?.let(java.time.Instant::ofEpochMilli)
            val windowStart = if (last == null) {
                now.minus(if (source.historyGranted()) BACKFILL_HISTORY else BACKFILL)
            } else {
                maxOf(last.minus(OVERLAP), now.minus(BACKFILL))
            }
            val zone = zoneOf(me.memberId)
            val recent = now.atZone(zone).toLocalDate().minusDays(BLOCK_NIGHTS - 1)
            // Nights whose block a previous sync failed to snap; older ones are let go.
            val pending = prefs[PENDING_SNAP].orEmpty()
                .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }
                .filter { it >= recent }
                .toSet()
            // Read far enough back to have every pending night again.
            val oldestPending = pending.minOrNull()?.takeIf { it < windowStart.atZone(zone).toLocalDate() }
            val readFrom = oldestPending?.atStartOfDay(zone)?.toInstant() ?: windowStart
            val fromDate = readFrom.atZone(zone).toLocalDate()
            // A day earlier, so the first night of the window is read whole.
            val sessions = source.read(readFrom.minus(Duration.ofDays(1)), now)
            val nights = SleepNightMapper.nights(sessions, zone).filter { it.date >= fromDate }
            val stored = remote.fetchDeviceRows(me.memberId, fromDate.toString()).associateBy { it.date }
            val changed = nights.filterNot { stored[it.date.toString()]?.matches(it) == true }
            val newTimes = changed.filter { it.date >= recent && stored[it.date.toString()].timesDiffer(it) }
            val toSnap = nights.filter { it in newTimes || it.date in pending }
            // Remembered before the upload: once the nights are stored they no
            // longer look new, so a sync cut short from here on (a lost
            // response, the process killed) would otherwise never snap them.
            val toSnapDates = toSnap.mapTo(mutableSetOf()) { it.date.toString() }
            if (toSnapDates.isNotEmpty() && toSnapDates != prefs[PENDING_SNAP]) {
                store.edit { it[PENDING_SNAP] = toSnapDates }
            }
            remote.upsertNights(me.workspaceId, me.memberId, changed)
            val snap = snapBlocks(me, toSnap, zone)
            store.edit {
                it[LAST_SYNC] = now.toEpochMilli()
                it[LAST_NIGHTS] = nights.size
                it.remove(PROBLEM)
                if (snap.failed.isEmpty()) {
                    it.remove(PENDING_SNAP)
                } else {
                    it[PENDING_SNAP] = snap.failed.mapTo(mutableSetOf()) { date -> date.toString() }
                }
            }
            HealthSyncResult.Synced(nights = nights.size, written = changed.size, blocks = snap.blocks)
        } catch (e: CancellationException) {
            throw e
        } catch (_: SecurityException) {
            lost()
        } catch (_: Exception) {
            store.edit { it[PROBLEM] = HealthSyncProblem.Failed.name }
            HealthSyncResult.Failed
        }
    }

    /**
     * Snaps the calendar to [nights]. Best effort: the nights are already
     * saved, so a calendar failure (offline halfway, a block deleted meanwhile)
     * never fails the sync; the nights it hit come back in [SnapResult.failed]
     * to retry next time. With auto-adjust off there is nothing to retry.
     */
    private suspend fun snapBlocks(me: SessionInfo, nights: List<SleepNight>, zone: ZoneId): SnapResult {
        if (nights.isEmpty()) return SnapResult()
        val prefs = try {
            remote.fetchBlockPrefs(me.memberId)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            return SnapResult(failed = nights.mapTo(mutableSetOf()) { it.date })
        }
        if (!prefs.autoAdjust) return SnapResult()
        var changed = 0
        val failed = mutableSetOf<LocalDate>()
        for (night in nights) {
            try {
                if (snapBlock(me, night, zone, prefs)) changed++
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                failed += night.date
            }
        }
        return SnapResult(blocks = changed, failed = failed)
    }

    /** Snaps one night's block; false when it already matched. */
    private suspend fun snapBlock(me: SessionInfo, night: SleepNight, zone: ZoneId, prefs: SleepBlockPrefs): Boolean {
        val window = SleepBlockPlanner.nightWindow(night.date, zone, prefs.nightWindowStartHour, prefs.nightWindowEndHour)
        val sleep = calendar.occurrences(window, zone.id)
            .filter { SleepBlockPlanner.isViewerSleep(it, me.memberId, prefs.sleepCategoryId) }
        val bed = night.bedtime.toKotlin()
        val woke = night.woke.toKotlin()
        when (val plan = SleepBlockPlanner.plan(bed, woke, sleep, window)) {
            SleepBlockPlan.Unchanged -> return false
            is SleepBlockPlan.Create ->
                calendar.create(me.workspaceId, me.memberId, plan.start, plan.end, zone.id, prefs.sleepCategoryId)
            is SleepBlockPlan.UpdateSingle -> calendar.move(plan.eventId, plan.start, plan.end)
            is SleepBlockPlan.Override ->
                calendar.moveOccurrence(plan.eventId, plan.occurrenceDate, plan.start, plan.end)
        }
        return true
    }

    /**
     * The zone nights are dated and blocks placed in: the member's profile
     * zone, as the check-in card and the Sleep tab use, else the device's.
     */
    private suspend fun zoneOf(memberId: String): ZoneId =
        memberZone.of(memberId)?.let { id -> runCatching { ZoneId.of(id) }.getOrNull() } ?: zone()

    /** [blocks] changed; the nights in [failed] still need their block snapped. */
    private data class SnapResult(val blocks: Int = 0, val failed: Set<LocalDate> = emptySet())

    /** Sign-out: forget the connection (the next member connects their own). */
    suspend fun clearLocal() {
        store.edit { it.clear() }
    }

    private suspend fun due(): Boolean {
        val last = store.data.first()[LAST_SYNC] ?: return true
        return clock.now().toEpochMilliseconds() - last >= FOREGROUND_EVERY.toMillis()
    }

    private suspend fun lost(): HealthSyncResult {
        store.edit {
            it[ENABLED] = false
            it[PROBLEM] = HealthSyncProblem.PermissionLost.name
        }
        return HealthSyncResult.NotConnected
    }

    companion object {
        val BACKFILL: Duration = Duration.ofDays(30)
        val BACKFILL_HISTORY: Duration = Duration.ofDays(90)
        val OVERLAP: Duration = Duration.ofHours(48)
        val FOREGROUND_EVERY: Duration = Duration.ofMinutes(15)
        /** Calendar blocks follow the tracker for this many most recent nights (today included). */
        const val BLOCK_NIGHTS = 4L

        internal val ENABLED = booleanPreferencesKey("enabled")
        internal val MEMBER = stringPreferencesKey("member_id")
        internal val LAST_SYNC = longPreferencesKey("last_sync_at")
        internal val LAST_NIGHTS = intPreferencesKey("last_nights")
        internal val PROBLEM = stringPreferencesKey("problem")
        /** ISO dates of recent nights whose calendar block still needs snapping. */
        internal val PENDING_SNAP = stringSetPreferencesKey("pending_snap")

        private fun processForeground(): Flow<Boolean> =
            ProcessLifecycleOwner.get().lifecycle.currentStateFlow
                .map { it.isAtLeast(Lifecycle.State.STARTED) }
                .flowOn(Dispatchers.Main)
    }
}

/** No stored row yet, typed times, or the tracker moved the night. */
private fun SleepDeviceRow?.timesDiffer(night: SleepNight): Boolean =
    this == null ||
        timesSource != "health_connect" ||
        bedtimeAt?.epochSeconds != night.bedtime.epochSecond ||
        wokeAt?.epochSeconds != night.woke.epochSecond
