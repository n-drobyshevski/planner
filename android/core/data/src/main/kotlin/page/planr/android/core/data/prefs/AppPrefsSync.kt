package page.planr.android.core.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionInfo
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.local.RefreshCoalescer
import page.planr.android.core.data.remote.AppPrefsRemote
import page.planr.android.core.data.remote.AppPrefsRow
import page.planr.android.core.data.sync.WidgetRefreshDispatcher

/** Wraps every local settings write, so the account copy follows it. */
fun interface AppPrefsChanges {
    /** Runs [edit] (the DataStore write) and schedules its upload. */
    suspend fun localChange(edit: suspend () -> Unit)
}

/**
 * Keeps the member's view settings ([ViewPreferences], and the signed-in
 * member's [InsightsPreferences]) in step with their `member_app_prefs` row,
 * so they survive an uninstall and follow the member to another device.
 *
 * The DataStores stay what the UI and widgets read. On top of them:
 * - **pull** (sign-in, app start, every sync): the account row overwrites the
 *   device, unless a local change is still waiting to upload (then that is
 *   uploaded instead). No row yet: the device's values are uploaded, so
 *   choices made before this existed are kept.
 * - **local change**: written at once, marked pending ([ViewKeys.SYNC_PENDING])
 *   and uploaded in the background; a failed upload stays pending and the
 *   next pull retries it.
 * - **Realtime**: another device's change is applied unless one is pending here.
 * - **sign-out**: [clearLocal] wipes the device copy, so the next member on
 *   this phone starts from their own.
 *
 * Network calls are serialized by [network] (a pull never reads a row older
 * than an upload that already finished); DataStore read-modify-writes by
 * [local], which is never held across the network, so a toggle never waits
 * on it. Pulls go through [coalescer]: the ones asked at once at a cold start
 * or a sign-in (the sign-in pull, the requested sync, the Realtime join)
 * share one read, and an unforced one skips a read done moments ago, unless
 * the Realtime join outdated it ([RefreshCoalescer]).
 */
@Singleton
class AppPrefsSync @Inject constructor(
    @ViewPreferencesDataStore private val view: DataStore<Preferences>,
    @InsightsPreferencesDataStore private val insights: DataStore<Preferences>,
    private val remote: AppPrefsRemote,
    private val session: SessionManager,
    private val widgets: WidgetRefreshDispatcher,
    @ApplicationScope private val scope: CoroutineScope,
    private val coalescer: RefreshCoalescer,
) : AppPrefsChanges {
    private val network = Mutex()
    private val local = Mutex()
    private var started = false

    /** Pulls on every sign-in (and the stored session at app start). Call once from Application.onCreate. */
    fun start() {
        if (started) return
        started = true
        scope.launch {
            session.authState
                .map { (it as? AuthState.SignedIn)?.session?.memberId }
                .distinctUntilChanged()
                .filterNotNull()
                .collect { pullQuietly(force = false) }
        }
    }

    override suspend fun localChange(edit: suspend () -> Unit) {
        local.withLock {
            view.edit { it[ViewKeys.SYNC_PENDING] = (it[ViewKeys.SYNC_PENDING] ?: 0L) + 1 }
            edit()
        }
        scope.launch { quietly { upload() } }
    }

    /**
     * Account → device (or the pending local change → account). Joins a pull
     * of the member's row already running; unless [force]d, also skips one
     * done moments ago. A pending local change is never joined or skipped: it
     * uploads now. Throws on network errors.
     */
    suspend fun pull(force: Boolean = true) {
        val me = session.currentSession ?: return
        if (pending() != null) {
            upload()
            return
        }
        coalescer.refresh(me.memberId, force) {
            pullLocked()
            true
        }
    }

    /** [pull], swallowing failures (offline: the next sync retries). */
    suspend fun pullQuietly(force: Boolean = true) = quietly { pull(force) }

    /** Device → account. Throws on network errors; the change stays pending. */
    suspend fun upload() = network.withLock {
        session.currentSession?.let { uploadLocked(it) }
    }

    /** A Realtime INSERT / UPDATE of `member_app_prefs`. */
    suspend fun applyRemote(record: JsonObject) {
        val me = session.currentSession ?: return
        val row = AppPrefsRemote.decode(record) ?: return
        if (row.memberId == me.memberId) applyRow(me, row)
    }

    /** Sign-out: forget every member's settings on this device. */
    suspend fun clearLocal() = local.withLock {
        view.edit { it.clear() }
        insights.edit { it.clear() }
    }

    private suspend fun pullLocked() = network.withLock {
        val me = session.currentSession ?: return@withLock
        // Changed while this pull waited: the change goes up instead.
        if (pending() != null) {
            uploadLocked(me)
            return@withLock
        }
        val row = remote.fetch(me.memberId)
        if (row == null) uploadLocked(me) else applyRow(me, row)
    }

    private suspend fun uploadLocked(me: SessionInfo) {
        val (row, seq) = local.withLock { snapshot(me) to pending() }
        remote.upsert(row)
        local.withLock {
            // Changed again meanwhile: still pending, its own upload follows.
            if (seq == null || pending() == seq) view.edit { it.remove(ViewKeys.SYNC_PENDING) }
        }
    }

    /** Writes [row] into the DataStores unless a local change is pending or the member changed. */
    private suspend fun applyRow(me: SessionInfo, row: AppPrefsRow) {
        val partnerChanged = local.withLock {
            if (pending() != null || session.currentSession?.memberId != me.memberId) return
            var changed = false
            view.edit {
                changed = (it[ViewKeys.SHOW_PARTNER_EVENTS] ?: true) != row.showPartnerEvents
                it[ViewKeys.SHOW_PARTNER_EVENTS] = row.showPartnerEvents
                it[ViewKeys.AGENDA_MODE] = AgendaViewMode.fromWire(row.agendaMode).wire
            }
            insights.edit {
                it[InsightsKeys.hidden(me.memberId)] = row.insightsHiddenCategoryIds.toSet()
                it[InsightsKeys.includeInactive(me.memberId)] = row.insightsIncludeInactive
            }
            changed
        }
        if (partnerChanged) widgets.requestRefresh()
    }

    private suspend fun snapshot(me: SessionInfo): AppPrefsRow {
        val v = view.data.first()
        val i = insights.data.first()
        return AppPrefsRow(
            memberId = me.memberId,
            workspaceId = me.workspaceId,
            showPartnerEvents = v[ViewKeys.SHOW_PARTNER_EVENTS] ?: true,
            agendaMode = AgendaViewMode.fromWire(v[ViewKeys.AGENDA_MODE]).wire,
            insightsHiddenCategoryIds = i[InsightsKeys.hidden(me.memberId)].orEmpty().sorted(),
            insightsIncludeInactive = i[InsightsKeys.includeInactive(me.memberId)] ?: false,
        )
    }

    private suspend fun pending(): Long? = view.data.first()[ViewKeys.SYNC_PENDING]

    private suspend fun quietly(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Offline or a server hiccup: still pending, the next pull retries.
        }
    }
}
