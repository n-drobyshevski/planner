package page.planr.android.core.data.sync

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.prefs.AppPrefsSync
import page.planr.android.core.data.remote.SupabaseTables

/**
 * Live sync while the app is in the foreground (and for [BACKGROUND_LINGER]
 * after it leaves, so a quick look at another app doesn't drop and rejoin
 * the channel, and refetch everything on return): one Realtime channel per
 * workspace with `postgres_changes` on the v1 tables, filtered by
 * `workspace_id` exactly like `subscribeWorkspace` in lib/supabase/realtime.ts.
 * RLS applies, so the partner's private rows never arrive.
 *
 * A filtered binding never sees a delete (Supabase Postgres Changes →
 * Limitations: the old record has only the primary key, so
 * `workspace_id=eq.…` never matches), nor a row turning private (RLS just
 * stops delivering it). Both come instead as [RowGone] broadcasts on a
 * second, private channel, `workspace:<id>:sync`, which only this
 * workspace's members can join (migration
 * `20261009000000_broadcast_deletes_and_editor`). They are also published
 * on [rowGone].
 *
 * Every change is written to Room (the screens and widgets follow from
 * there). Each time the main channel (re)joins, the visible window, tasks
 * and reference data are refetched: changes may have been missed while it
 * was down or the app was in the background. So are they when the sync
 * channel rejoins on its own (see [syncRejoinsAlone]).
 */
@Singleton
class RealtimeSync @Inject constructor(
    private val supabase: SupabaseClient,
    private val session: SessionManager,
    private val applier: RealtimeChangeApplier,
    private val cacheGate: CacheGate,
    private val syncRunner: SyncRunner,
    private val widgets: WidgetRefreshDispatcher,
    private val appPrefs: AppPrefsSync,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private var started = false
    private val _subscribed = MutableStateFlow(false)

    /**
     * Whether the main channel is joined right now, so the cache is being
     * kept live (the periodic sync has nothing to add then; see
     * [SyncWorker]). The sync channel is left out on purpose: should it fail
     * to join (a server without the broadcast migration), the main channel
     * still keeps everything but deletes live, and the periodic sync must
     * not stop because of it.
     */
    val subscribed: StateFlow<Boolean> = _subscribed.asStateFlow()

    private val _rowGone = MutableSharedFlow<RowGone>(
        extraBufferCapacity = ROW_GONE_BUFFER,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    /**
     * Every [RowGone] the sync channel delivers (the partner's and this
     * member's own, from any device), after the cache has applied it.
     */
    val rowGone: SharedFlow<RowGone> = _rowGone.asSharedFlow()

    /** Call once from Application.onCreate. */
    fun start() {
        if (started) return
        started = true
        scope.launch {
            channelWorkspace(isForeground(), workspaceIds(), BACKGROUND_LINGER)
                .collectLatest { ws -> if (ws != null) runChannel(ws) }
        }
    }

    private suspend fun runChannel(workspaceId: String) {
        val channel = supabase.channel("workspace:$workspaceId:android")
        val sync = supabase.channel(RowGone.topic(workspaceId)) { isPrivate = true }
        // Taken before joining: a change still arriving after a sign-out wiped the cache is dropped.
        val ticket = cacheGate.ticket()
        try {
            coroutineScope {
                // Register every listener before joining.
                val changes = merge(
                    *RealtimeChangeApplier.TABLES.map { table -> changesOf(channel, table, workspaceId) }.toTypedArray(),
                )
                launch(start = CoroutineStart.UNDISPATCHED) {
                    changes.collect { (table, change) ->
                        val applied = runCatching { applier.apply(table, change, ticket) }.getOrDefault(false)
                        if (applied) widgets.requestRefresh()
                    }
                }
                launch(start = CoroutineStart.UNDISPATCHED) {
                    sync.broadcastFlow<JsonObject>(RowGone.EVENT).mapNotNull { RowGone.parse(it) }.collect { gone ->
                        if (gone.removesFor(session.currentSession?.memberId)) {
                            val applied = runCatching { applier.apply(gone.table, gone.toDelete(), ticket) }.getOrDefault(false)
                            if (applied) widgets.requestRefresh()
                        }
                        _rowGone.emit(gone)
                    }
                }
                // The member's view settings, changed on another device (RLS: never the partner's).
                launch(start = CoroutineStart.UNDISPATCHED) {
                    changesOf(channel, SupabaseTables.MEMBER_APP_PREFS, workspaceId).collect { (_, change) ->
                        if (change is RowChange.Upsert) runCatching { appPrefs.applyRemote(change.record) }
                    }
                }
                launch {
                    channel.status.collect { _subscribed.value = it == RealtimeChannel.Status.SUBSCRIBED }
                }
                launch {
                    // Changes committed before the channel was subscribed never arrive
                    // over it, so a snapshot begun before then (a screen's own refresh
                    // on opening the app) can't stand in for this refetch. Screens
                    // refreshing after it join it instead.
                    channel.status
                        .filter { it == RealtimeChannel.Status.SUBSCRIBED }
                        .collect {
                            cacheGate.outdateSnapshots()
                            refetchQuietly()
                        }
                }
                launch {
                    // Deletes sent while only the sync channel was down never arrive either.
                    syncRejoinsAlone(channel.status.map { it.isJoined() }, sync.status.map { it.isJoined() })
                        .collect {
                            cacheGate.outdateSnapshots()
                            refetchQuietly()
                        }
                }
                launch {
                    // A refreshed token must reach the open socket before the old one expires.
                    session.accessTokens.drop(1).collect { token ->
                        if (token != null) runCatching { supabase.realtime.setAuth(token) }
                    }
                }
                channel.subscribe()
                try {
                    sync.subscribe()
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    // Deletes then wait for the next refetch; the main channel carries on.
                }
                awaitCancellation()
            }
        } finally {
            _subscribed.value = false
            withContext(NonCancellable) {
                runCatching { supabase.realtime.removeChannel(channel) }
                runCatching { supabase.realtime.removeChannel(sync) }
            }
        }
    }

    private fun RealtimeChannel.Status.isJoined() = this == RealtimeChannel.Status.SUBSCRIBED

    /** INSERT / UPDATE of this workspace's rows (RLS applies). */
    private fun changesOf(channel: RealtimeChannel, table: String, workspaceId: String): Flow<Pair<String, RowChange>> =
        channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            this.table = table
            filter("workspace_id", FilterOperator.EQ, workspaceId)
        }.mapNotNull { action ->
            val change = when (action) {
                is PostgresAction.Insert -> RowChange.Upsert(action.record)
                is PostgresAction.Update -> RowChange.Upsert(action.record)
                // Never delivered under a filter; deletes come as [RowGone] broadcasts.
                is PostgresAction.Delete, is PostgresAction.Select -> null
            }
            change?.let { table to it }
        }

    private suspend fun refetchQuietly() {
        try {
            syncRunner.syncVisible()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Offline or a server hiccup: the next (re)join or periodic sync catches up.
        }
    }

    private fun workspaceIds(): Flow<String?> =
        session.authState.map { (it as? AuthState.SignedIn)?.session?.workspaceId }

    private fun isForeground(): Flow<Boolean> =
        ProcessLifecycleOwner.get().lifecycle.currentStateFlow
            .map { it.isAtLeast(Lifecycle.State.STARTED) }
            .flowOn(Dispatchers.Main)

    internal companion object {
        /** How long the channel stays joined after the app leaves the foreground. */
        val BACKGROUND_LINGER = 60.seconds

        /** [rowGone] events kept for a slow collector (a burst: a task subtree or a whole collection). */
        const val ROW_GONE_BUFFER = 64
    }
}

/**
 * Emits each time the sync channel joins again while the main channel was
 * joined all along: the main channel's own (re)join refetches everything,
 * but deletes sent while only the sync channel was down would otherwise be
 * missed until the next one. The first join emits nothing (the main
 * channel's join covers it), and nor does a rejoin after the main channel
 * itself rejoined in the meantime.
 */
internal fun syncRejoinsAlone(mainJoined: Flow<Boolean>, syncJoined: Flow<Boolean>): Flow<Unit> = flow {
    var mainUp = false
    var mainJoins = 0
    var syncUp = false
    // mainJoins when the sync channel dropped; null while it is up or before its first join.
    var droppedAt: Int? = null
    merge(
        mainJoined.distinctUntilChanged().map { true to it },
        syncJoined.distinctUntilChanged().map { false to it },
    ).collect { (isMain, up) ->
        if (isMain) {
            mainUp = up
            if (up) mainJoins++
        } else {
            if (up && mainUp && droppedAt == mainJoins) emit(Unit)
            if (up) {
                droppedAt = null
            } else if (syncUp) {
                droppedAt = mainJoins
            }
            syncUp = up
        }
    }
}

/**
 * The workspace whose channel should be open, or null for none: the
 * signed-in one while [foreground], and for [linger] after the app leaves
 * the foreground. Coming back within [linger] changes nothing (no rejoin, no
 * refetch); signing out closes the channel at once.
 */
internal fun channelWorkspace(
    foreground: Flow<Boolean>,
    workspaceIds: Flow<String?>,
    linger: Duration,
): Flow<String?> =
    combine(foreground.lingering(linger), workspaceIds) { live, ws -> ws.takeIf { live } }
        .distinctUntilChanged()

/** [this], with each `false` held back until it has lasted [linger] (a `true` meanwhile cancels it). */
@OptIn(ExperimentalCoroutinesApi::class)
private fun Flow<Boolean>.lingering(linger: Duration): Flow<Boolean> =
    transformLatest { foreground ->
        if (!foreground) delay(linger)
        emit(foreground)
    }.distinctUntilChanged()
