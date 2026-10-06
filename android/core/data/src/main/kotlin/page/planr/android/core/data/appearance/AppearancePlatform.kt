package page.planr.android.core.data.appearance

import android.app.LocaleManager
import android.app.UiModeManager
import android.content.Context
import android.content.res.Resources
import android.os.Build
import android.os.LocaleList
import androidx.annotation.ChecksSdkIntAtLeast
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.ConfigurationCompat
import androidx.core.os.LocaleListCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import page.planr.android.core.model.ThemePreference

/** Where [MemberAppearanceApplier]'s decisions reach Android; a fake in tests. */
interface AppearancePlatform {
    /** Whether [setNightMode] reaches the system, which then keeps it across restarts (API 31+). */
    val keepsNightMode: Boolean

    /** Persists the app's own night mode (API 31+; a no-op before, see [ThemeModeStore]). */
    fun setNightMode(preference: ThemePreference)

    /** The app's own language override as BCP 47 tags; empty: it follows the system. */
    fun appLocales(): List<String>

    /** The system's languages, preferred first. */
    fun systemLocales(): List<String>

    /** Sets the app's language, kept across restarts; the open activities are recreated in it. */
    fun setAppLocale(tag: String)

    /**
     * Confirms that the app follows the system language. Below API 33 an
     * override AppCompat stored earlier is only read when the first activity
     * starts, so [appLocales] can read empty before then; this clears it.
     * A no-op where the platform keeps the override (API 33+).
     */
    fun followSystemLocale()
}

class AndroidAppearancePlatform @Inject constructor(
    @ApplicationContext private val context: Context,
) : AppearancePlatform {

    @get:ChecksSdkIntAtLeast(api = Build.VERSION_CODES.S)
    override val keepsNightMode: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    override fun setNightMode(preference: ThemePreference) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        // Kept by the system across restarts, and applied to every window of
        // the app (splash, system bars, the Quick add sheet) before it draws.
        context.getSystemService(UiModeManager::class.java)
            ?.setApplicationNightMode(AppearanceRules.nightModeFor(preference))
    }

    override fun appLocales(): List<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            localeManager()?.applicationLocales?.toLanguageTags().tags()
        } else {
            AppCompatDelegate.getApplicationLocales().toLanguageTags().tags()
        }

    override fun systemLocales(): List<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            localeManager()?.systemLocales?.toLanguageTags().tags()
        } else {
            // The system's own configuration: the app's resources carry its override.
            ConfigurationCompat.getLocales(Resources.getSystem().configuration).toLanguageTags().tags()
        }

    override fun setAppLocale(tag: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            localeManager()?.applicationLocales = LocaleList.forLanguageTags(tag)
        } else {
            setAppCompatLocales(LocaleListCompat.forLanguageTags(tag))
        }
    }

    override fun followSystemLocale() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
        // A no-op when AppCompat already holds no override; otherwise the
        // activities are recreated only if their language actually changes.
        setAppCompatLocales(LocaleListCompat.getEmptyLocaleList())
    }

    /** AppCompat applies it to (recreates) its open activities: on the main thread. */
    private fun setAppCompatLocales(locales: LocaleListCompat) {
        ContextCompat.getMainExecutor(context).execute { AppCompatDelegate.setApplicationLocales(locales) }
    }

    // From 33 the system keeps the app's language (and AppCompat would only
    // reach it through an open activity, while this also runs without one, e.g.
    // for a widget update). Below 33 AppCompat keeps it (autoStoreLocales in the
    // app manifest) and applies it to its activities: Planr's are all
    // AppCompatActivity. Other contexts there (widgets, notifications) still
    // follow the system language.
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun localeManager(): LocaleManager? = context.getSystemService(LocaleManager::class.java)

    private fun String?.tags(): List<String> = orEmpty().split(',').filter { it.isNotBlank() }
}
