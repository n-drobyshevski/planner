package page.planr.android.core.insights.selectors

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.tasks
import page.planr.android.core.insights.model.LeadTime

/** Golden parity of [TasksSelectors] with view-selectors.ts, Tasks group (fixtures/selectors-tasks.json). */
class TasksSelectorsTest {

    @TestFactory
    fun leadTimeParts(): List<DynamicTest> = Fixtures.section(AREA, "leadTimeParts") { input ->
        // `ms` may be fractional (an even-count median), so read it as a double.
        Fixtures.json(TasksSelectors.leadTime(input.getValue("ms").jsonPrimitive.content.toDouble()))
    }

    @TestFactory
    fun hasTopLevelTasks(): List<DynamicTest> = Fixtures.section(AREA, "hasTopLevelTasks") { input ->
        JsonPrimitive(TasksSelectors.hasTopLevel(input.tasks("tasks")))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections(AREA, setOf("leadTimeParts", "hasTopLevelTasks"))

    @Test
    fun `hours can round up to 24, as the web prints 2d 24h`() {
        val ms = 2 * DAY + 23 * HOUR + 40 * 60_000.0
        assertEquals(LeadTime.DaysHours(days = 2, hours = 24), TasksSelectors.leadTime(ms))
    }

    @Test
    fun `half an hour rounds up, JS style`() {
        // kotlin.math.round would give 2 (half-even); Math.round gives 3.
        assertEquals(LeadTime.DaysHours(days = 2, hours = 3), TasksSelectors.leadTime(2 * DAY + 2.5 * HOUR))
    }

    private companion object {
        const val AREA = "selectors-tasks"
        const val DAY = 86_400_000.0
        const val HOUR = 3_600_000.0
    }
}
