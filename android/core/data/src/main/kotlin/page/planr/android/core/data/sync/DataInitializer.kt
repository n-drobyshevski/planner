package page.planr.android.core.data.sync

import javax.inject.Inject
import javax.inject.Singleton

/** Starts the data layer's long-running parts. Call once from Application.onCreate. */
@Singleton
class DataInitializer @Inject constructor(
    private val realtimeSync: RealtimeSync,
    private val syncScheduler: SyncScheduler,
) {
    fun start() {
        realtimeSync.start()
        syncScheduler.start()
    }
}
