package page.planr.android.widgets

import android.app.Application
import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.os.Build
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Re-renders the widgets when the system switches light/dark on API 26–30.
 *
 * From Android 12 RemoteViews carry both colours of a day/night
 * ColorProvider and the launcher picks; before that Glance resolves them once,
 * at render time, so a scheduled dark mode would leave the light paper card on
 * a dark home screen until the next refresh. Nothing else re-renders on a
 * uiMode change ([WidgetTimeReceiver] covers time, zone and locale only), so
 * the application watches its own configuration while the process lives.
 */
object WidgetNightModeWatcher {

    /** Call once from Application.onCreate. */
    fun install(app: Application) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
        val lastNightMode = AtomicInteger(nightMode(app.resources.configuration))
        app.registerComponentCallbacks(
            object : ComponentCallbacks {
                override fun onConfigurationChanged(newConfig: Configuration) {
                    val mode = nightMode(newConfig)
                    if (lastNightMode.getAndSet(mode) != mode) {
                        scope.launch { runCatching { WidgetUpdates.refreshAll(app) } }
                    }
                }

                @Deprecated("Deprecated in Java")
                override fun onLowMemory() = Unit
            },
        )
    }

    private fun nightMode(config: Configuration): Int = config.uiMode and Configuration.UI_MODE_NIGHT_MASK

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
}
