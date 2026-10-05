package page.planr.android.core.design.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * The Insights chart tokens (app/globals.css `--chart-1..5` and the palette.ts
 * comparison treatment). Read through `PlanrTheme.colors.chart`.
 *
 * [series] mirrors palette.ts order, but teal (index 1, Member B) and amber
 * (index 2, "ours") are never used for non-category marks: averages use
 * [line], comparisons [neutral] / [comparison], so a derived series can't read
 * as a person.
 */
@Immutable
data class ChartColors(
    /** chart-1..5; index 0 (warm stone) is the focal series. */
    val series: List<Color>,
    /** muted-foreground: Other, No context, the comparison base. */
    val neutral: Color,
    /** [neutral] at [COMPARISON_ALPHA]: the previous-period ghost. */
    val comparison: Color,
    /** Derived metric lines (7-day averages): onSurface at 70%, no identity. */
    val line: Color,
    /** `--muted` at 50%: the empty heatmap step only. */
    val track: Color,
    /** `--muted` at 100%: the share-bar and track-bar tracks. */
    val trackStrong: Color,
    /** `--border` at 35% (border/50 × strokeOpacity .7): gridlines and the cursor. */
    val grid: Color,
)

/** palette.ts `COMPARISON_OPACITY`. */
const val COMPARISON_ALPHA = 0.4f

val LightChartColors = ChartColors(
    series = listOf(Color(0xFF57534E), Color(0xFF0F766E), Color(0xFFB45309), Color(0xFF0369A1), Color(0xFF7C3AED)),
    neutral = PlanrTokens.StoneMuted,
    comparison = PlanrTokens.StoneMuted.copy(alpha = COMPARISON_ALPHA),
    line = PlanrTokens.StoneInk.copy(alpha = 0.7f),
    track = PlanrTokens.WarmStone100.copy(alpha = 0.5f),
    trackStrong = PlanrTokens.WarmStone100,
    grid = PlanrTokens.WarmStoneBorder.copy(alpha = 0.35f),
)

val DarkChartColors = ChartColors(
    series = listOf(Color(0xFFA8A29E), Color(0xFF2DD4BF), Color(0xFFFBBF24), Color(0xFF38BDF8), Color(0xFFC4B5FD)),
    neutral = PlanrTokens.DarkMutedForeground,
    comparison = PlanrTokens.DarkMutedForeground.copy(alpha = COMPARISON_ALPHA),
    line = PlanrTokens.WarmPaper.copy(alpha = 0.7f),
    track = PlanrTokens.DarkMuted.copy(alpha = 0.5f),
    trackStrong = PlanrTokens.DarkMuted,
    grid = PlanrTokens.DarkMuted.copy(alpha = 0.35f),
)
