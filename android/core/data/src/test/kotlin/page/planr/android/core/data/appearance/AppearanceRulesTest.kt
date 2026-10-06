package page.planr.android.core.data.appearance

import android.app.UiModeManager
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
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
}
