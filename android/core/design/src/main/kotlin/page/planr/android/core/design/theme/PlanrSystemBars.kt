package page.planr.android.core.design.theme

import android.content.res.Configuration
import android.content.res.Resources
import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

/**
 * [enableEdgeToEdge] with bar icons and scrims for the theme PlanrTheme draws
 * rather than the system's: [forcedDark] true / false pins them dark / light,
 * null follows the configuration (from Android 12 that already carries the
 * member's theme). Call again when [forcedDark] changes.
 */
fun ComponentActivity.enablePlanrEdgeToEdge(forcedDark: Boolean?) {
    val dark = { resources: Resources ->
        forcedDark ?: ((resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES)
    }
    enableEdgeToEdge(
        statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT, dark),
        navigationBarStyle = SystemBarStyle.auto(LightNavigationScrim, DarkNavigationScrim, dark),
    )
}

// enableEdgeToEdge's own defaults (androidx.activity keeps them internal).
private val LightNavigationScrim = Color.argb(0xe6, 0xFF, 0xFF, 0xFF)
private val DarkNavigationScrim = Color.argb(0x80, 0x1b, 0x1b, 0x1b)
