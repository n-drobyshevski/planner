package page.planr.android.core.data.appearance

import android.app.UiModeManager
import page.planr.android.core.model.AppLocale
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

    /** `members.locale` as a language tag; the DB CHECK and the web's next-intl locales are both en | ru. */
    fun languageTagFor(locale: AppLocale): String = when (locale) {
        AppLocale.En -> "en"
        AppLocale.Ru -> "ru"
    }

    /**
     * The app language to set for [wanted], or null when the app already
     * shows it: through its own override ([appTags]) or, with none, the
     * system's first language ([systemTags]). Only the language is compared,
     * so an en-GB phone stays en-GB for an English member. A change keeps the
     * region of a matching system language (ru-RU) for dates and numbers,
     * else it is the bare language.
     */
    fun localeTagToApply(wanted: AppLocale, appTags: List<String>, systemTags: List<String>): String? {
        val language = languageTagFor(wanted)
        val shown = appTags.ifEmpty { systemTags }.firstOrNull()
        if (shown != null && languageOf(shown) == language) return null
        return systemTags.firstOrNull { languageOf(it) == language } ?: language
    }

    private fun languageOf(tag: String): String = tag.substringBefore('-').substringBefore('_').lowercase()
}

/** Light / Dark pin the theme; null follows the system. */
fun ThemePreference.forcedDark(): Boolean? = when (this) {
    ThemePreference.Light -> false
    ThemePreference.Dark -> true
    ThemePreference.System -> null
}
