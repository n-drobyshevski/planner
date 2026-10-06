package page.planr.android.core.design.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily

/**
 * The Planr theme: warm paper, stone ink, one warm-stone accent, and member
 * colors that carry meaning. Wrap every screen (and previews) in it.
 *
 * @param darkTheme defaults to the configuration, which from Android 12
 *   already carries the member's `theme_preference`; activities pass
 *   `ThemeModeStore.forcedDark ?: isSystemInDarkTheme()` so older versions
 *   follow it too.
 */
@Composable
fun PlanrTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val sans = sansFamilyForLocale()
    val typography = remember(sans) { planrTypography(sans) }
    CompositionLocalProvider(
        LocalPlanrColors provides if (darkTheme) DarkPlanrColors else LightPlanrColors,
        LocalPlanrTypography provides DefaultPlanrExtendedTypography,
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) PlanrDarkColorScheme else PlanrLightColorScheme,
            typography = typography,
            shapes = PlanrShapes,
            content = content,
        )
    }
}

/** Accessors for the Planr-specific tokens, alongside [MaterialTheme]. */
object PlanrTheme {
    val colors: PlanrColors
        @Composable @ReadOnlyComposable get() = LocalPlanrColors.current

    val type: PlanrExtendedTypography
        @Composable @ReadOnlyComposable get() = LocalPlanrTypography.current
}

/**
 * Jakarta for Latin locales; Manrope where the UI language needs Cyrillic,
 * since Jakarta lacks basic Cyrillic glyphs (mirrors the web's font stack).
 */
@Composable
private fun sansFamilyForLocale(): FontFamily {
    val language = LocalConfiguration.current.locales[0]?.language
    return if (language == "ru") ManropeFamily else PlusJakartaSansFamily
}
