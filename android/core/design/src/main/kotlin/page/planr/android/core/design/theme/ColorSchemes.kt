package page.planr.android.core.design.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Material 3 roles mapped from the web tokens. `primary` is the single warm-stone
 * accent (primary action, focus, active, selection only). Secondary/tertiary stay
 * in warm neutrals on purpose so Material components never introduce a second
 * decorative accent; member and category colors live in [PlanrColors].
 */
val PlanrLightColorScheme: ColorScheme = lightColorScheme(
    primary = PlanrTokens.WarmStone,
    onPrimary = PlanrTokens.CardWhite,
    primaryContainer = PlanrTokens.WarmStoneAccent,
    onPrimaryContainer = PlanrTokens.StoneInk,
    inversePrimary = PlanrTokens.WarmStoneDark,
    secondary = PlanrTokens.StoneMuted,
    onSecondary = PlanrTokens.CardWhite,
    secondaryContainer = PlanrTokens.WarmStone100,
    onSecondaryContainer = PlanrTokens.Stone700,
    tertiary = PlanrTokens.StoneMuted,
    onTertiary = PlanrTokens.CardWhite,
    tertiaryContainer = PlanrTokens.WarmStone100,
    onTertiaryContainer = PlanrTokens.Stone700,
    background = PlanrTokens.WarmPaper,
    onBackground = PlanrTokens.StoneInk,
    surface = PlanrTokens.WarmPaper,
    onSurface = PlanrTokens.StoneInk,
    surfaceVariant = PlanrTokens.WarmStone100,
    onSurfaceVariant = PlanrTokens.StoneMuted,
    // No primary-tinted tonal elevation: depth is hairlines, not color shifts.
    surfaceTint = Color.Transparent,
    inverseSurface = PlanrTokens.StoneInk,
    inverseOnSurface = PlanrTokens.WarmPaper,
    error = PlanrTokens.DestructiveRed,
    onError = PlanrTokens.CardWhite,
    errorContainer = Color(0xFFF7E4E1),
    onErrorContainer = PlanrTokens.DestructiveRed,
    outline = PlanrTokens.WarmStone300,
    outlineVariant = PlanrTokens.WarmStoneBorder,
    scrim = PlanrTokens.ShadowStone,
    surfaceBright = PlanrTokens.CardWhite,
    surfaceDim = Color(0xFFECE6DF),
    surfaceContainerLowest = PlanrTokens.CardWhite,
    surfaceContainerLow = Color(0xFFFCFAF8),
    surfaceContainer = PlanrTokens.Sidebar,
    surfaceContainerHigh = PlanrTokens.WarmStone100,
    surfaceContainerHighest = Color(0xFFECE6DF),
)

val PlanrDarkColorScheme: ColorScheme = darkColorScheme(
    primary = PlanrTokens.WarmStoneDark,
    onPrimary = PlanrTokens.Stone800,
    primaryContainer = PlanrTokens.DarkMuted,
    onPrimaryContainer = PlanrTokens.WarmPaper,
    inversePrimary = PlanrTokens.WarmStone,
    secondary = PlanrTokens.DarkMutedForeground,
    onSecondary = PlanrTokens.Stone800,
    secondaryContainer = PlanrTokens.DarkMuted,
    onSecondaryContainer = PlanrTokens.WarmPaper,
    tertiary = PlanrTokens.DarkMutedForeground,
    onTertiary = PlanrTokens.Stone800,
    tertiaryContainer = PlanrTokens.DarkMuted,
    onTertiaryContainer = PlanrTokens.WarmPaper,
    background = PlanrTokens.WarmCharcoal,
    onBackground = PlanrTokens.WarmPaper,
    surface = PlanrTokens.WarmCharcoal,
    onSurface = PlanrTokens.WarmPaper,
    surfaceVariant = PlanrTokens.DarkMuted,
    onSurfaceVariant = PlanrTokens.DarkMutedForeground,
    surfaceTint = Color.Transparent,
    inverseSurface = PlanrTokens.WarmPaper,
    inverseOnSurface = PlanrTokens.Stone800,
    error = PlanrTokens.DestructiveRedDark,
    onError = PlanrTokens.WarmCharcoal,
    errorContainer = Color(0xFF4A2522),
    onErrorContainer = PlanrTokens.DestructiveRedDark,
    outline = Color(0xFF5C554F),
    outlineVariant = PlanrTokens.DarkMuted,
    scrim = Color(0xFF0C0A09),
    surfaceBright = PlanrTokens.DarkMuted,
    surfaceDim = PlanrTokens.WarmCharcoal,
    surfaceContainerLowest = Color(0xFF171412),
    surfaceContainerLow = Color(0xFF211E1B),
    surfaceContainer = PlanrTokens.Stone800,
    surfaceContainerHigh = Color(0xFF312C29),
    surfaceContainerHighest = PlanrTokens.DarkInput,
)
