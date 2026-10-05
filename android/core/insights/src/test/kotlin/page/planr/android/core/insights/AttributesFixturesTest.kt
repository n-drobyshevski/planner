package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.Focus
import page.planr.android.core.model.PlanrJson

/** Golden parity of [Attributes.parse] with the web's lenient `parseAttributes`. */
class AttributesFixturesTest {

    @TestFactory
    fun parse(): List<DynamicTest> = Fixtures.section("attributes", "parse") { input ->
        Fixtures.json(Attributes.parse(input["raw"]))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("attributes", setOf("parse"))

    @Test
    fun `a missing bag and the data layer's junk energy parse to nothing usable`() {
        assertEquals(Attributes.None, Attributes.parse(null))
        // core/data's row fixtures carry "energy": "high".
        val parsed = Attributes.parse(PlanrJson.parseToJsonElement("""{"energy": "high", "focus": "deep"}"""))
        assertEquals(Attributes(focus = Focus.Deep), parsed)
    }
}
