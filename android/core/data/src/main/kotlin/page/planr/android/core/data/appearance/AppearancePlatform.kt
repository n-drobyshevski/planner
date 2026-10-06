package page.planr.android.core.data.appearance

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import page.planr.android.core.model.ThemePreference

/** Where [MemberAppearanceApplier]'s decisions reach Android; a fake in tests. */
interface AppearancePlatform {
    /** Persists the app's own night mode (API 31+; a no-op before, see [ThemeModeStore]). */
    fun setNightMode(preference: ThemePreference)
}

class AndroidAppearancePlatform @Inject constructor(
    @ApplicationContext private val context: Context,
) : AppearancePlatform {

    override fun setNightMode(preference: ThemePreference) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        // Kept by the system across restarts, and applied to every window of
        // the app (splash, system bars, the Quick add sheet) before it draws.
        context.getSystemService(UiModeManager::class.java)
            ?.setApplicationNightMode(AppearanceRules.nightModeFor(preference))
    }
}
