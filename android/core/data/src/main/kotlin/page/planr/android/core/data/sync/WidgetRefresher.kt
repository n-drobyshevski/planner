package page.planr.android.core.data.sync

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
 * Fans refresh requests out to every [WidgetRefresher]. Writes and Realtime
 * changes call [requestRefresh] (debounced, so a burst of row changes
 * re-renders once); the periodic sync awaits [refreshNow] when it changed
 * the cache, and [refreshClockBound] when it didn't.
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

    init {
        scope.launch { requests.debounce(DEBOUNCE).collect { refreshNow() } }
    }

    fun requestRefresh() {
        requests.tryEmit(Unit)
    }

    suspend fun refreshNow() = refresh(refreshers.get())

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
