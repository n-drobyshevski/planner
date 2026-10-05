package page.planr.android.core.design.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * The ≥ 3:1 fill-vs-card floor of lib/insights/palette.ts (WCAG contrast math
 * ported from there), for the chart tokens and the category swatches that
 * color category series.
 */
class ChartContrastTest {

    private val lightCard = Color(0xFFFFFFFF)
    private val darkCard = Color(0xFF292524)

    @Test
    fun `chart marks clear 3 to 1 on the light card`() = assertMarks(LightChartColors, lightCard)

    @Test
    fun `chart marks clear 3 to 1 on the dark card`() = assertMarks(DarkChartColors, darkCard)

    @Test
    fun `category swatches clear 3 to 1 on the light card`() {
        PlanrSwatches.all.forEach { (name, swatch) -> assertFloor(name, swatch, lightCard) }
    }

    @Test
    fun `the dark category ink rule clears 3 to 1 on the dark card`() {
        // Same rule as the agenda's BlockStyle: lighten toward white on dark.
        PlanrSwatches.all.forEach { (name, swatch) -> assertFloor(name, lerp(swatch, Color.White, 0.42f), darkCard) }
    }

    @Test
    fun `the themes carry their own chart tokens`() {
        assertTrue(LightPlanrColors.chart === LightChartColors)
        assertTrue(DarkPlanrColors.chart === DarkChartColors)
    }

    private fun assertMarks(chart: ChartColors, card: Color) {
        chart.series.forEachIndexed { i, color -> assertFloor("series[$i]", color, card) }
        assertFloor("neutral", chart.neutral, card)
        assertFloor("line", chart.line, card)
    }

    private fun assertFloor(name: String, color: Color, card: Color) {
        val ratio = contrastRatio(over(color, card), card)
        assertTrue(ratio >= MIN_FILL_CONTRAST, "$name: contrast $ratio < $MIN_FILL_CONTRAST")
    }

    /** [color] alpha-composited over the opaque [background], per sRGB channel. */
    private fun over(color: Color, background: Color): Color {
        val a = color.alpha
        return Color(
            red = color.red * a + background.red * (1 - a),
            green = color.green * a + background.green * (1 - a),
            blue = color.blue * a + background.blue * (1 - a),
        )
    }

    /** palette.ts `relativeLuminance` (WCAG 2.x). */
    private fun luminance(c: Color): Double {
        fun linear(channel: Float): Double {
            val v = (channel * 255).roundToInt().coerceIn(0, 255) / 255.0
            return if (v <= 0.03928) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * linear(c.red) + 0.7152 * linear(c.green) + 0.0722 * linear(c.blue)
    }

    /** palette.ts `contrastRatio`. */
    private fun contrastRatio(a: Color, b: Color): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    private companion object {
        /** palette.ts `MIN_FILL_CONTRAST`. */
        const val MIN_FILL_CONTRAST = 3.0
    }
}
