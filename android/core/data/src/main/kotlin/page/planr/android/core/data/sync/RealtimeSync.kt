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
import kotlinx.coroutines.Job
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
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
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
 * there). Each time the channels (re)join, the visible window, tasks and
 * reference data are refetched: changes may have been missed while either
 * was down or the app was in the background (see [refetchOnJoin]).
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
     * Whether both channels are joined right now, so the cache is being kept
     * live (the periodic sync has nothing to add then; see [SyncWorker]).
     * Without the sync channel deletes would not arrive, so should it fail
     * to join (a server without the broadcast migration, say), the periodic
     * sync keeps running and catches them up.
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
                val mainJoined = channel.status.map { it.isJoined() }
                val syncJoined = sync.status.map { it.isJoined() }
                launch {
                    combine(mainJoined, syncJoined) { mainUp, syncUp -> mainUp && syncUp }
                        .collect { _subscribed.value = it }
                }
                launch {
                    // Changes committed before the channels were subscribed never arrive
                    // over them, so a snapshot begun before then (a screen's own refresh
                    // on opening the app) can't stand in for this refetch. Screens
                    // refreshing after it join it instead.
                    refetchOnJoin(mainJoined, syncJoined, SYNC_JOIN_GRACE).collect {
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

        /** How long the main channel's join waits for the sync channel's before refetching anyway. */
        val SYNC_JOIN_GRACE = 5.seconds
    }
}

/**
 * Emits when a refetch should run: once both channels are joined after the
 * main one (re)joined, so a single refetch covers the gap of each (a delete
 * sent before the sync channel joined never arrives over it, however soon
 * after the main channel's join that was), and whenever the sync channel
 * (re)joins on its own while the main one stays joined. Should the sync
 * channel not join within [grace] of the main one, it emits anyway: the main
 * channel's changes must not wait on it.
 */
internal fun refetchOnJoin(mainJoined: Flow<Boolean>, syncJoined: Flow<Boolean>, grace: Duration): Flow<Unit> =
    channelFlow {
        var mainUp = false
        var syncUp = false
        var waiting: Job? = null
        merge(
            mainJoined.distinctUntilChanged().map { true to it },
            syncJoined.distinctUntilChanged().map { false to it },
        ).collect { (isMain, up) ->
            if (isMain) {
                mainUp = up
                waiting?.cancel()
                waiting = null
                if (up && syncUp) {
                    send(Unit)
                } else if (up) {
                    waiting = launch {
                        delay(grace)
                        send(Unit)
                    }
                }
            } else {
                syncUp = up
                if (up && mainUp) {
                    waiting?.cancel()
                    waiting = null
                    send(Unit)
                }
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
