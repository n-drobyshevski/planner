package page.planr.android.core.data.sync

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import page.planr.android.core.data.di.ApplicationScope

/**
 * Re-renders home-screen widgets from Room. Implemented by :widgets and
 * contributed into a set, so :core:data never depends on Glance:
 *
 * ```
 * @Binds @IntoSet abstract fun bind(impl: GlanceWidgetRefresher): WidgetRefresher
 * ```
 *
 * Anything else that shows the cache outside the app joins the same set:
 * event reminders re-plan here (`ReminderRefresher`).
 */
interface WidgetRefresher {
    suspend fun refreshWidgets()

    /**
     * Whether what this renders moves on with the clock as well as with the
     * cache (reminders are planned a rolling day ahead). Such a refresher
     * also runs after a sync that changed nothing
     * ([WidgetRefreshDispatcher.refreshClockBound]); the rest only when
     * something did.
     */
    val followsClock: Boolean get() = false
}

/**
 * Fans refresh requests out to every [WidgetRefresher]. Writes, Realtime
 * changes and snapshot refreshes that changed the cache (whoever asked for
 * them) call [requestRefresh] (debounced, so a burst of row changes
 * re-renders once); the periodic sync awaits [refreshNow] when it changed
 * the cache, and [refreshClockBound] when it didn't, both [holding] the
 * requests its own refreshes make meanwhile, so it renders once. A request
 * that a [refreshNow] begun after it already covered is dropped.
 */
@OptIn(FlowPreview::class)
@Singleton
class WidgetRefreshDispatcher @Inject constructor(
    // Provider: widget implementations may depend on repositories that depend on us.
    private val refreshers: Provider<Set<@JvmSuppressWildcards WidgetRefresher>>,
    @ApplicationScope scope: CoroutineScope,
) {
    private val requests = MutableSharedFlow<Unit>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    /** How many requests were made, and how many of them a full render begun since covers. */
    private val requested = AtomicLong()
    private val covered = AtomicLong()

    /** How many [holding] blocks are running: requests made meanwhile wait for the last to end. */
    private val holds = AtomicInteger()

    init {
        scope.launch {
            requests.debounce(DEBOUNCE).collect {
                if (requested.get() != covered.get()) refreshNow()
            }
        }
    }

    fun requestRefresh() {
        requested.incrementAndGet()
        if (holds.get() == 0) requests.tryEmit(Unit)
    }

    /**
     * Runs [block] (a sync that ends with its own [refreshNow] or
     * [refreshClockBound]) with [requestRefresh] calls held back: once it
     * ends, only those its own [refreshNow] didn't cover go out.
     */
    suspend fun <T> holding(block: suspend () -> T): T {
        holds.incrementAndGet()
        try {
            return block()
        } finally {
            if (holds.decrementAndGet() == 0 && requested.get() != covered.get()) requests.tryEmit(Unit)
        }
    }

    suspend fun refreshNow() {
        // Every request made so far follows the write it is about, so a render
        // starting now reads what it asked for.
        val upTo = requested.get()
        covered.accumulateAndGet(upTo, ::maxOf)
        refresh(refreshers.get())
    }

    /** Only the refreshers that [follow the clock][WidgetRefresher.followsClock]: the cache didn't change. */
    suspend fun refreshClockBound() = refresh(refreshers.get().filter { it.followsClock })

    private suspend fun refresh(targets: Collection<WidgetRefresher>) {
        for (refresher in targets) {
            try {
                refresher.refreshWidgets()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // A widget failing to render must never fail a write or a sync.
            }
        }
    }

    private companion object {
        val DEBOUNCE = 500.milliseconds
    }
}
