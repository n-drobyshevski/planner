package page.planr.android.core.data.appearance

import android.app.UiModeManager
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import page.planr.android.core.model.AppLocale
import page.planr.android.core.model.ThemePreference

class AppearanceRulesTest {

    @Test
    fun `theme preference maps to the app night mode`() {
        assertEquals(UiModeManager.MODE_NIGHT_NO, AppearanceRules.nightModeFor(ThemePreference.Light))
        assertEquals(UiModeManager.MODE_NIGHT_YES, AppearanceRules.nightModeFor(ThemePreference.Dark))
        // AUTO clears the app's override: it follows the system again.
        assertEquals(UiModeManager.MODE_NIGHT_AUTO, AppearanceRules.nightModeFor(ThemePreference.System))
    }

    @Test
    fun `light and dark pin the theme, system follows the configuration`() {
        assertEquals(false, ThemePreference.Light.forcedDark())
        assertEquals(true, ThemePreference.Dark.forcedDark())
        assertNull(ThemePreference.System.forcedDark())
    }

    @Test
    fun `a theme reaches the platform only when it changed`() {
        assertTrue(AppearanceRules.shouldApplyTheme(lastApplied = null, wanted = ThemePreference.System))
        assertTrue(AppearanceRules.shouldApplyTheme(lastApplied = ThemePreference.Light, wanted = ThemePreference.Dark))
        assertFalse(AppearanceRules.shouldApplyTheme(lastApplied = ThemePreference.Dark, wanted = ThemePreference.Dark))
    }

    @Test
    fun `member locale maps to the web's language tags`() {
        assertEquals("en", AppearanceRules.languageTagFor(AppLocale.En))
        assertEquals("ru", AppearanceRules.languageTagFor(AppLocale.Ru))
    }

    @Test
    fun `a language the app already shows is left alone`() {
        // Following an English system, region and all.
        assertNull(AppearanceRules.localeTagToApply(AppLocale.En, appTags = emptyList(), systemTags = listOf("en-GB", "ru-RU")))
        // Its own override already Russian, whatever the system says.
        assertNull(AppearanceRules.localeTagToApply(AppLocale.Ru, appTags = listOf("ru"), systemTags = listOf("en-US")))
        assertNull(AppearanceRules.localeTagToApply(AppLocale.Ru, appTags = listOf("ru-RU"), systemTags = emptyList()))
    }

    @Test
    fun `another language is set, keeping a matching system region`() {
        assertEquals("ru-RU", AppearanceRules.localeTagToApply(AppLocale.Ru, appTags = emptyList(), systemTags = listOf("en-GB", "ru-RU")))
        assertEquals("en-GB", AppearanceRules.localeTagToApply(AppLocale.En, appTags = listOf("ru"), systemTags = listOf("ru-RU", "en-GB")))
        assertEquals("ru", AppearanceRules.localeTagToApply(AppLocale.Ru, appTags = emptyList(), systemTags = listOf("de-DE")))
        assertEquals("en", AppearanceRules.localeTagToApply(AppLocale.En, appTags = listOf("ru"), systemTags = emptyList()))
    }
}
