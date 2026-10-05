package page.planr.android.feature.insights.ui.components

import kotlin.test.Test
import kotlin.test.assertEquals
import page.planr.android.core.insights.model.Delta

/** stat-card.tsx `DeltaBadge` branches, and the glyph spans of [glyphText]. */
class DeltaBadgeTest {

    @Test
    fun `a null pct is new with movement, no change without`() {
        assertEquals(DeltaBadgeSpec("▲", DeltaText.New, DeltaSpoken.New, 0), deltaBadge(Delta(3.0, null)))
        assertEquals(DeltaBadgeSpec("–", DeltaText.None, DeltaSpoken.NoChange, 0), deltaBadge(Delta(0.0, null)))
    }

    @Test
    fun `the percent rounds like JS and the glyph follows the sign`() {
        assertEquals(DeltaBadgeSpec("▲", DeltaText.Percent, DeltaSpoken.Up, 13), deltaBadge(Delta(1.0, 0.125)))
        // Math.round(12.5) = 13 and Math.round(-12.5)'s magnitude here is round(12.5) = 13 too (abs first).
        assertEquals(DeltaBadgeSpec("▼", DeltaText.Percent, DeltaSpoken.Down, 13), deltaBadge(Delta(-1.0, -0.125)))
        assertEquals(DeltaBadgeSpec("–", DeltaText.Percent, DeltaSpoken.NoChange, 0), deltaBadge(Delta(0.0, 0.0)))
        assertEquals(DeltaBadgeSpec("–", DeltaText.Percent, DeltaSpoken.NoChange, 0), deltaBadge(Delta(0.0, -0.0)))
    }

    @Test
    fun `only the triangle and circle glyphs get the mono span`() {
        val text = glyphText("▲ 3 pts · ○ unusual ▼")
        assertEquals("▲ 3 pts · ○ unusual ▼", text.text)
        assertEquals(listOf(0 to 1, 10 to 11, 20 to 21), text.spanStyles.map { it.start to it.end })
        assertEquals(0, glyphText("no glyphs – here").spanStyles.size)
    }
}
