package page.planr.android.core.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRating
import page.planr.android.core.data.model.keepDeviceTimes
import page.planr.android.core.data.prefs.ViewKeys
import page.planr.android.core.data.prefs.ViewPreferencesDataStore
import page.planr.android.core.data.remote.SleepRemote

/**
 * The signed-in member's recent nights (`sleep_logs`, member-private) for the
 * morning check-in and the Insights Sleep tab. Read from the server on
 * demand and kept in memory; nothing is cached on disk.
 */
interface SleepLogRepository {
    /**
     * The member's nights from the last [RECENT_DAYS] days, newest first;
     * null until the first [refresh] for this member landed.
     */
    val recentLogs: Flow<List<SleepLog>?>

    /** Refetches [recentLogs]. Throws when offline. */
    suspend fun refresh()

    /**
     * Saves a check-in on [SleepRating.date] and returns the night as stored.
     * Against the row as stored now, untouched times on an existing night and
     * times that would only echo a Health Connect night's are dropped
     * ([SleepRating.timesFor], [keepDeviceTimes]), so the device's times and
     * stages stay.
     */
    suspend fun save(rating: SleepRating): SleepLog

    /** The wake date the morning check-in was last dismissed on, on this device. */
    val checkinDismissedOn: Flow<LocalDate?>

    suspend fun dismissCheckin(date: LocalDate)

    companion object {
        /** Days of history read: the Sleep tab lists 14 nights, the prefill looks a little further. */
        const val RECENT_DAYS = 30
    }
}

/** Thrown by [SleepLogRepository.save] when the server returned no row. */
class SleepLogNotSavedException : IllegalStateException("sleep_logs upsert returned no row")

@OptIn(ExperimentalCoroutinesApi::class)
@Singleton
class RemoteSleepLogRepository @Inject constructor(
    private val remote: SleepRemote,
    private val session: SessionManager,
    @ViewPreferencesDataStore private val store: DataStore<Preferences>,
    private val clock: Clock,
) : SleepLogRepository {

    private data class Cached(val memberId: String, val logs: List<SleepLog>)

    private val cache = MutableStateFlow<Cached?>(null)

    /**
     * One read or save at a time: a read that started before a save landed
     * would otherwise overwrite the saved night with its older copy (the
     * check-in card would come back).
     */
    private val io = Mutex()

    /** Reads finished so far; a caller that waited out another read skips its own. */
    @Volatile
    private var reads = 0L

    private val memberId: Flow<String?> =
        session.authState.map { (it as? AuthState.SignedIn)?.session?.memberId }.distinctUntilChanged()

    override val recentLogs: Flow<List<SleepLog>?> = combine(memberId, cache) { member, cached ->
        cached?.takeIf { member != null && it.memberId == member }?.logs
    }.distinctUntilChanged()

    override suspend fun refresh() {
        val me = session.currentSession ?: return
        val seen = reads
        io.withLock {
            // The agenda's start and its ON_RESUME (or two screens) ask at once: one read serves both.
            if (reads != seen && cache.value?.memberId == me.memberId) return
            // A day of slack either side of any zone; the UI picks its own nights.
            val since = clock.now().toLocalDateTime(TimeZone.UTC).date.minus(DatePeriod(days = SleepLogRepository.RECENT_DAYS + 1))
            val logs = remote.fetchLogs(me.memberId, since.toString())
            cache.value = Cached(me.memberId, logs.sortedByDescending { it.date })
            reads++
        }
    }

    override suspend fun save(rating: SleepRating): SleepLog = io.withLock {
        val me = session.requireSession()
        // The stored row, not the cache: a Health Connect sync may have just written it.
        val existing = remote.fetchLog(me.memberId, rating.date)
        val stored = remote.upsertRating(
            workspaceId = me.workspaceId,
            memberId = me.memberId,
            date = rating.date,
            quality = rating.quality,
            fatigue = rating.fatigue,
            note = rating.note,
            times = rating.timesFor(existing),
        ) ?: throw SleepLogNotSavedException()
        cache.update { cached ->
            if (cached == null || cached.memberId != me.memberId) {
                cached
            } else {
                cached.copy(logs = (cached.logs.filterNot { it.date == stored.date } + stored).sortedByDescending { it.date })
            }
        }
        stored
    }

    // Per device and per member, like the web's localStorage flag; never synced.
    override val checkinDismissedOn: Flow<LocalDate?> = memberId.flatMapLatest { member ->
        if (member == null) {
            flowOf(null)
        } else {
            store.data.map { prefs -> prefs[ViewKeys.sleepCheckinDismissed(member)]?.let { runCatching { LocalDate.parse(it) }.getOrNull() } }
        }
    }.distinctUntilChanged()

    override suspend fun dismissCheckin(date: LocalDate) {
        val me = session.currentSession ?: return
        store.edit { it[ViewKeys.sleepCheckinDismissed(me.memberId)] = date.toString() }
    }
}
