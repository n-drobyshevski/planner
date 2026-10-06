package page.planr.android.core.data.appearance

import android.app.UiModeManager
import page.planr.android.core.model.ThemePreference

/** The pure decisions behind [MemberAppearanceApplier], kept apart so they unit-test without a device. */
internal object AppearanceRules {

    /** [UiModeManager.setApplicationNightMode]'s mode; AUTO means "follow the system". */
    fun nightModeFor(preference: ThemePreference): Int = when (preference) {
        ThemePreference.Light -> UiModeManager.MODE_NIGHT_NO
        ThemePreference.Dark -> UiModeManager.MODE_NIGHT_YES
        ThemePreference.System -> UiModeManager.MODE_NIGHT_AUTO
    }

    /** Only a change reaches the platform (it recreates every activity); nothing applied yet always does. */
    fun shouldApplyTheme(lastApplied: ThemePreference?, wanted: ThemePreference): Boolean = lastApplied != wanted
}

/** Light / Dark pin the theme; null follows the system. */
fun ThemePreference.forcedDark(): Boolean? = when (this) {
    ThemePreference.Light -> false
    ThemePreference.Dark -> true
    ThemePreference.System -> null
}
