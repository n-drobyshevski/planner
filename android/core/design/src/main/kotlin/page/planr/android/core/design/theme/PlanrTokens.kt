package page.planr.android.core.design.theme

import androidx.compose.ui.graphics.Color

/**
 * Raw color tokens, copied from app/globals.css (`:root` and `.dark`) and
 * DESIGN.md. Everything else in the design system is built from these; screens
 * should reach for [androidx.compose.material3.MaterialTheme.colorScheme] or
 * [PlanrTheme.colors] rather than these constants.
 *
 * Every neutral is warm stone — never pure black, never a cold gray.
 */
object PlanrTokens {
    // Light — warm paper + stone ink, one warm-stone accent.
    val WarmPaper = Color(0xFFFAF8F5)
    val CardWhite = Color(0xFFFFFFFF)
    val StoneInk = Color(0xFF292524)
    val WarmStone = Color(0xFF57534E)
    val WarmStone100 = Color(0xFFF2EDE7)
    val WarmStoneAccent = Color(0xFFF1EBE4)
    val Stone700 = Color(0xFF44403C)
    val StoneMuted = Color(0xFF57514B)
    val WarmStoneBorder = Color(0xFFE7E0D7)
    val WarmStone300 = Color(0xFFD6CFC6)
    val Sidebar = Color(0xFFF6F2EC)
    val DestructiveRed = Color(0xFFA11414)

    // Dark — warm charcoal, never pure black.
    val WarmCharcoal = Color(0xFF1C1917)
    val Stone800 = Color(0xFF292524)
    val DarkMuted = Color(0xFF3A3531)
    val DarkInput = Color(0xFF423C37)
    val WarmStoneDark = Color(0xFFA8A29E)
    val DarkMutedForeground = Color(0xFFBCB3AA)
    val DestructiveRedDark = Color(0xFFFCA5A5)

    // Meaning, not decoration: whose (member A / B) and ours (shared).
    val MemberA = Color(0xFFC0492A) // terracotta coral
    val MemberALight = Color(0xFFF2754E) // legible coral text on dark
    val MemberB = Color(0xFF0F766E) // teal
    val MemberBLight = Color(0xFF2DD4BF)
    val SharedAmber = Color(0xFFB45309)
    val SharedAmberLight = Color(0xFFFBBF24)

    /** Warm shadow tint (`rgb(28 25 23)`), never `#000`. */
    val ShadowStone = Color(0xFF1C1917)
}

/**
 * The category/item swatch set (`--swatch-*` in the default palette). Item and
 * category colors are stored as hex in the DB; these are the canonical values,
 * each keeping white ink at ≥ AA on the fill in both themes.
 */
object PlanrSwatches {
    val all: Map<String, Color> = linkedMapOf(
        "rosewater" to Color(0xFFAB6056),
        "flamingo" to Color(0xFFB75556),
        "pink" to Color(0xFFD02F6B),
        "mauve" to Color(0xFF8749FB),
        "red" to Color(0xFFD43834),
        "maroon" to Color(0xFFB34958),
        "peach" to Color(0xFFC54E2F),
        "yellow" to Color(0xFFB95813),
        "green" to Color(0xFF1F8643),
        "teal" to Color(0xFF23827A),
        "sky" to Color(0xFF217E9B),
        "sapphire" to Color(0xFF2A77B8),
        "blue" to Color(0xFF2078B1),
        "lavender" to Color(0xFF7162DB),
        "stone" to Color(0xFF65615C),
    )

    /** Legible ink over any filled swatch. */
    val ink = Color(0xFFFFFFFF)
}
