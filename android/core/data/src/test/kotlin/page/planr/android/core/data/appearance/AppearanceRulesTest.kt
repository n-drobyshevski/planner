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
        for (keeps in listOf(false, true)) {
            assertTrue(AppearanceRules.shouldApplyTheme(null, ThemePreference.System, platformKeeps = keeps, reachedPlatform = false))
            assertTrue(AppearanceRules.shouldApplyTheme(ThemePreference.Light, ThemePreference.Dark, platformKeeps = keeps, reachedPlatform = keeps))
            assertFalse(AppearanceRules.shouldApplyTheme(ThemePreference.Dark, ThemePreference.Dark, platformKeeps = keeps, reachedPlatform = keeps))
        }
    }

    @Test
    fun `a theme cached before the platform could keep it reaches the platform once it can`() {
        // Applied on Android 11 (cache only), the phone since updated to 12+.
        assertTrue(AppearanceRules.shouldApplyTheme(ThemePreference.Dark, ThemePreference.Dark, platformKeeps = true, reachedPlatform = false))
        // Still below 12: the cache is all there is.
        assertFalse(AppearanceRules.shouldApplyTheme(ThemePreference.Dark, ThemePreference.Dark, platformKeeps = false, reachedPlatform = false))
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
