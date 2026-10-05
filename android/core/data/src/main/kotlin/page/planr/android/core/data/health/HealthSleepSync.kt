package page.planr.android.core.data.health

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import java.time.Duration
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
import page.planr.android.core.data.auth.SessionManager
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
    data class Synced(val nights: Int, val written: Int) : HealthSyncResult
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
 * - Connecting is per device and per member: after another member signs in on
 *   this phone, nothing syncs until they connect themselves.
 */
@Singleton
class HealthSleepSync @Inject constructor(
    private val source: HealthSleepSource,
    private val remote: SleepRemote,
    private val session: SessionManager,
    @HealthPrefsDataStore private val store: DataStore<Preferences>,
    private val clock: Clock,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private val mutex = Mutex()
    private var started = false

    /** The device zone; replaced in tests. */
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
            val zone = zone()
            val fromDate = windowStart.atZone(zone).toLocalDate()
            // A day earlier, so the first night of the window is read whole.
            val sessions = source.read(windowStart.minus(Duration.ofDays(1)), now)
            val nights = SleepNightMapper.nights(sessions, zone).filter { it.date >= fromDate }
            val stored = remote.fetchDeviceRows(me.memberId, fromDate.toString()).associateBy { it.date }
            val changed = nights.filterNot { stored[it.date.toString()]?.matches(it) == true }
            remote.upsertNights(me.workspaceId, me.memberId, changed)
            store.edit {
                it[LAST_SYNC] = now.toEpochMilli()
                it[LAST_NIGHTS] = nights.size
                it.remove(PROBLEM)
            }
            HealthSyncResult.Synced(nights = nights.size, written = changed.size)
        } catch (e: CancellationException) {
            throw e
        } catch (_: SecurityException) {
            lost()
        } catch (_: Exception) {
            store.edit { it[PROBLEM] = HealthSyncProblem.Failed.name }
            HealthSyncResult.Failed
        }
    }

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

        internal val ENABLED = booleanPreferencesKey("enabled")
        internal val MEMBER = stringPreferencesKey("member_id")
        internal val LAST_SYNC = longPreferencesKey("last_sync_at")
        internal val LAST_NIGHTS = intPreferencesKey("last_nights")
        internal val PROBLEM = stringPreferencesKey("problem")

        private fun processForeground(): Flow<Boolean> =
            ProcessLifecycleOwner.get().lifecycle.currentStateFlow
                .map { it.isAtLeast(Lifecycle.State.STARTED) }
                .flowOn(Dispatchers.Main)
    }
}
