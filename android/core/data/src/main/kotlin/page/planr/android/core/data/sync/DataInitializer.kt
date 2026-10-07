package page.planr.android.core.data.sync

import javax.inject.Inject
import javax.inject.Singleton
import page.planr.android.core.data.appearance.MemberAppearanceApplier
import page.planr.android.core.data.health.HealthSleepSync
import page.planr.android.core.data.notify.NewRequestNotifier
import page.planr.android.core.data.prefs.AppPrefsSync

/** Starts the data layer's long-running parts. Call once from Application.onCreate. */
@Singleton
class DataInitializer @Inject constructor(
    private val realtimeSync: RealtimeSync,
    private val syncScheduler: SyncScheduler,
    private val appPrefs: AppPrefsSync,
    private val healthSleep: HealthSleepSync,
    private val appearance: MemberAppearanceApplier,
    private val newRequests: NewRequestNotifier,
) {
    fun start() {
        appearance.start()
        appPrefs.start()
        healthSleep.start()
        realtimeSync.start()
        syncScheduler.start()
        newRequests.start()
    }
}
