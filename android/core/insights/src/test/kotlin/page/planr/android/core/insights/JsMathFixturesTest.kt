package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.double
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.model.MsWindow

/** Golden parity of [JsMath] with JS `Math.round` and `toFixed` (fixtures/jsmath.json). */
class JsMathFixturesTest {

    @TestFactory
    fun round(): List<DynamicTest> = Fixtures.section("jsmath", "round") { input ->
        JsonPrimitive(JsMath.round(input.double("x")))
    }

    @TestFactory
    fun toFixed(): List<DynamicTest> = Fixtures.section("jsmath", "toFixed") { input ->
        JsonPrimitive(JsMath.toFixed(input.double("x"), input.int("digits")))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("jsmath", setOf("round", "toFixed"))

    @Test
    fun `negative zero prints like JS, which JSON cannot carry`() {
        assertEquals("0.0", JsMath.toFixed(-0.0, 1))
        assertEquals("-0.0", JsMath.toFixed(-0.04, 1))
    }

    @Test
    fun `percentOf and dayCount use JS rounding`() {
        assertEquals(0, JsMath.percentOf(5.0, 0.0))
        assertEquals(13, JsMath.percentOf(1.0, 8.0)) // 12.5 rounds half up
        assertEquals(-12, JsMath.percentOf(-1.0, 8.0)) // -12.5 rounds toward +∞
        assertEquals(7, JsMath.dayCount(MsWindow(0, 6 * 86_400_000L + 23 * 3_600_000L)))
        assertEquals(1, JsMath.dayCount(MsWindow(0, 12 * 3_600_000L)))
    }

    @Test
    fun `round is half toward positive infinity`() {
        assertEquals(3L, JsMath.roundToLong(2.5))
        assertEquals(-2L, JsMath.roundToLong(-2.5))
        assertEquals(0, JsMath.roundToInt(0.49999999999999994))
    }
}
