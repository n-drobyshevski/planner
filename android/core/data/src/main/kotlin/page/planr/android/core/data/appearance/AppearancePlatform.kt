package page.planr.android.core.data.appearance

import android.app.LocaleManager
import android.app.UiModeManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import androidx.annotation.RequiresApi
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import page.planr.android.core.model.ThemePreference

/** Where [MemberAppearanceApplier]'s decisions reach Android; a fake in tests. */
interface AppearancePlatform {
    /** Persists the app's own night mode (API 31+; a no-op before, see [ThemeModeStore]). */
    fun setNightMode(preference: ThemePreference)

    /**
     * The app's own language override as BCP 47 tags (empty: it follows the
     * system); null where there is no per-app language (below API 33).
     */
    fun appLocales(): List<String>?

    /** The system's languages, preferred first. */
    fun systemLocales(): List<String>

    /** Sets the app's language (API 33+); the system keeps it and recreates the activities. */
    fun setAppLocale(tag: String)
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

    override fun appLocales(): List<String>? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
        return localeManager()?.applicationLocales?.tags()
    }

    override fun systemLocales(): List<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return emptyList()
        return localeManager()?.systemLocales?.tags().orEmpty()
    }

    override fun setAppLocale(tag: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        localeManager()?.applicationLocales = LocaleList.forLanguageTags(tag)
    }

    // Below 33 there is no per-app language without AppCompat activities, so
    // the app keeps following the system language there.
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun localeManager(): LocaleManager? = context.getSystemService(LocaleManager::class.java)

    private fun LocaleList.tags(): List<String> = toLanguageTags().split(',').filter { it.isNotBlank() }
}
