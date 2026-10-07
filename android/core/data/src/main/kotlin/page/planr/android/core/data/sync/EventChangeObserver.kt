package page.planr.android.core.data.sync

import page.planr.android.core.model.PlannerEvent

/**
 * Hears how event rows from elsewhere change in the cache: a window
 * refresh replacing rows ([page.planr.android.core.data.repository.EventRepository.refreshWindow])
 * and Realtime upserts and deletes ([RealtimeChangeApplier]). For the
 * partner-change notifications; the device's own writes are not reported.
 * Both calls must return at once: they come from inside cache writes.
 */
interface EventChangeObserver {
    /** Whether anyone listens now: the callers skip reading what was cached otherwise. */
    val listening: Boolean

    /** Each row as cached before (null: it wasn't) and as now stored. */
    fun eventsChanged(changes: List<Pair<PlannerEvent?, PlannerEvent>>)

    /** A deleted row ([RowGone.Kind.Delete]), with what was cached of it (null: nothing). */
    fun eventGone(before: PlannerEvent?, gone: RowGone)

    /** Nobody listens (tests, and callers built without one). */
    object None : EventChangeObserver {
        override val listening: Boolean get() = false

        override fun eventsChanged(changes: List<Pair<PlannerEvent?, PlannerEvent>>) = Unit

        override fun eventGone(before: PlannerEvent?, gone: RowGone) = Unit
    }
}
