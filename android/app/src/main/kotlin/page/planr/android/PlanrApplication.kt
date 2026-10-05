package page.planr.android

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import page.planr.android.core.data.sync.DataInitializer
import page.planr.android.widgets.WidgetNightModeWatcher

/**
 * Starts the data layer and supplies WorkManager's configuration, so workers
 * (SyncWorker) are built by Hilt. The default WorkManager initializer is
 * removed in the manifest; WorkManager initializes on first use from here.
 */
@HiltAndroidApp
class PlanrApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var dataInitializer: DataInitializer

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        // Realtime while in the foreground, periodic sync while signed in.
        dataInitializer.start()
        // API 26–30 widgets bake in light/dark at render time.
        WidgetNightModeWatcher.install(this)
    }
}
