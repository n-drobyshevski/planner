package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.Stats
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.double

/** Golden parity of [Stats] with lib/analytics/stats.ts (fixtures/stats.json). */
class StatsFixturesTest {

    @TestFactory
    fun median(): List<DynamicTest> = Fixtures.section("stats", "median") { input ->
        Fixtures.num(Stats.median(input.doubles("values")))
    }

    @TestFactory
    fun mad(): List<DynamicTest> = Fixtures.section("stats", "mad") { input ->
        Fixtures.num(Stats.mad(input.doubles("values")))
    }

    @TestFactory
    fun robustZ(): List<DynamicTest> = Fixtures.section("stats", "robustZ") { input ->
        Fixtures.num(Stats.robustZ(input.double("value"), input.double("med"), input.double("mad")))
    }

    @TestFactory
    fun theilSenSlope(): List<DynamicTest> = Fixtures.section("stats", "theilSenSlope") { input ->
        val points = input.getValue("points").jsonArray.map { it.jsonObject.let { o -> o.double("x") to o.double("y") } }
        Fixtures.num(Stats.theilSenSlope(points))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("stats", setOf("median", "mad", "robustZ", "theilSenSlope"))

    @Test
    fun `median sorts a copy and leaves the input alone`() {
        val values = mutableListOf(4.0, 1.0, 3.0, 2.0)
        assertEquals(2.5, Stats.median(values))
        assertEquals(listOf(4.0, 1.0, 3.0, 2.0), values)
    }

    @Test
    fun `negative and positive zero tie like JS a - b`() {
        // Stable, value-only ordering keeps input order for -0.0 / 0.0.
        assertEquals(-0.0, Stats.median(listOf(0.0, -0.0, 5.0)))
        assertEquals(0.0, Stats.median(listOf(-0.0, 0.0, 5.0)))
    }

    @Test
    fun `robustZ is null only for a zero MAD`() {
        assertNull(Stats.robustZ(7.0, 3.0, 0.0))
        assertNull(Stats.robustZ(7.0, 3.0, -0.0))
        assertEquals(0.0, Stats.robustZ(3.0, 3.0, 2.0))
    }
}

/** `[number]` → doubles. */
private fun JsonObject.doubles(k: String): List<Double> =
    getValue(k).jsonArray.map { it.jsonPrimitive.content.toDouble() }
