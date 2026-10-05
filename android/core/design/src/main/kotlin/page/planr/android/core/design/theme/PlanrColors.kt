package page.planr.android.core.design.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * A meaning color as it renders in both event styles: [fill] with [onFill] ink
 * for "mine / ours" (solid), and [text] for "theirs" (outlined, tinted fill,
 * colored text) — see the Event Block in DESIGN.md §5.
 */
@Immutable
data class MeaningColor(
    val fill: Color,
    val onFill: Color,
    /** Colored text / outline on the page background; lightened in dark mode. */
    val text: Color,
) {
    /** The tinted background of an outlined (partner's) block: fill at ~12%. */
    val tint: Color get() = fill.copy(alpha = 0.12f)
}

/**
 * Planr colors Material has no role for: who owns what, the hairline ring that
 * replaces resting shadows, and the warm sidebar surface. Read through
 * [PlanrTheme.colors].
 *
 * Member colors here are the defaults; a member's own `members.color` hex wins
 * when present (see [parseHexColor]).
 */
@Immutable
data class PlanrColors(
    val memberA: MeaningColor,
    val memberB: MeaningColor,
    val shared: MeaningColor,
    /** Card edge at rest: foreground at ~10% (`ring-1 ring-foreground/10`). */
    val hairline: Color,
    val sidebar: Color,
    /** Raised surfaces (cards, sheets). */
    val card: Color,
    val isDark: Boolean,
)

val LightPlanrColors = PlanrColors(
    memberA = MeaningColor(PlanrTokens.MemberA, PlanrTokens.CardWhite, PlanrTokens.MemberA),
    memberB = MeaningColor(PlanrTokens.MemberB, PlanrTokens.CardWhite, PlanrTokens.MemberB),
    shared = MeaningColor(PlanrTokens.SharedAmber, PlanrTokens.CardWhite, PlanrTokens.SharedAmber),
    hairline = PlanrTokens.StoneInk.copy(alpha = 0.10f),
    sidebar = PlanrTokens.Sidebar,
    card = PlanrTokens.CardWhite,
    isDark = false,
)

val DarkPlanrColors = PlanrColors(
    memberA = MeaningColor(PlanrTokens.MemberA, PlanrTokens.CardWhite, PlanrTokens.MemberALight),
    memberB = MeaningColor(PlanrTokens.MemberB, PlanrTokens.CardWhite, PlanrTokens.MemberBLight),
    shared = MeaningColor(PlanrTokens.SharedAmber, PlanrTokens.CardWhite, PlanrTokens.SharedAmberLight),
    hairline = PlanrTokens.WarmPaper.copy(alpha = 0.10f),
    sidebar = PlanrTokens.WarmCharcoal,
    card = PlanrTokens.Stone800,
    isDark = true,
)

internal val LocalPlanrColors = staticCompositionLocalOf { LightPlanrColors }

/** Parses a `#rrggbb` / `#aarrggbb` hex from the DB, or returns [fallback]. */
fun parseHexColor(hex: String?, fallback: Color): Color {
    val digits = hex?.removePrefix("#") ?: return fallback
    val argb = when (digits.length) {
        6 -> digits.toLongOrNull(16)?.or(0xFF000000)
        8 -> digits.toLongOrNull(16)
        else -> null
    } ?: return fallback
    return Color(argb)
}
