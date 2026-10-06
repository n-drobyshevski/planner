package page.planr.android.core.data.local

import dagger.Lazy
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import page.planr.android.core.data.auth.LocalDataCleaner
import page.planr.android.core.data.health.HealthSleepSync
import page.planr.android.core.data.prefs.AppPrefsSync
import page.planr.android.core.data.reminders.ReminderScheduler
import page.planr.android.core.data.sync.WidgetRefreshDispatcher

/**
 * Sign-out: drop every cached row, the device copy of the member's view
 * settings (restored from their account on the next sign-in), their
 * Health Connect connection and their event reminders (alarms and shown
 * notifications), then let the widgets re-render signed out.
 * The wipe goes through [CacheGate], so a fetch still in flight can't write
 * its rows back afterwards.
 */
class RoomLocalDataCleaner @Inject constructor(
    private val db: PlanrDatabase,
    private val gate: CacheGate,
    private val widgets: WidgetRefreshDispatcher,
    // Lazy: AppPrefsSync depends on the SessionManager that depends on us.
    private val appPrefs: Lazy<AppPrefsSync>,
    private val healthSleep: Lazy<HealthSleepSync>,
    private val reminders: Lazy<ReminderScheduler>,
) : LocalDataCleaner {
    override suspend fun clearAll() {
        gate.wipe { withContext(Dispatchers.IO) { db.clearAllTables() } }
        appPrefs.get().clearLocal()
        healthSleep.get().clearLocal()
        reminders.get().clearLocal()
        widgets.refreshNow()
    }
}
