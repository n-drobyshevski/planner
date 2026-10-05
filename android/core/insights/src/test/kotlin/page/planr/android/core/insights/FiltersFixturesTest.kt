package page.planr.android.core.insights

import kotlin.test.Test
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.filter.InsightsFilter
import page.planr.android.core.insights.filter.InsightsFilters
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.boolean
import page.planr.android.core.insights.fixtures.Fixtures.spans
import page.planr.android.core.insights.fixtures.Fixtures.string
import page.planr.android.core.insights.fixtures.Fixtures.strings
import page.planr.android.core.insights.fixtures.Fixtures.tasks

/** Golden parity of [InsightsFilters] with lib/insights/filters.ts and the shell's task slice. */
class FiltersFixturesTest {

    @TestFactory
    fun filterForInsights(): List<DynamicTest> = Fixtures.section("filters", "filterForInsights") { input ->
        val filter = InsightsFilter(
            viewerId = input.string("viewerId"),
            hiddenCategoryIds = input.strings("hiddenCategoryIds").toSet(),
            includeInactive = input.boolean("includeInactive"),
        )
        Fixtures.strings(InsightsFilters.filterForInsights(input.spans("spans"), filter).map { it.key })
    }

    @TestFactory
    fun isTracked(): List<DynamicTest> = Fixtures.section("filters", "isTracked") { input ->
        val span = Fixtures.span(input.getValue("span").jsonObject)
        JsonPrimitive(InsightsFilters.isTracked(span, input.boolean("includeInactive")))
    }

    @TestFactory
    fun viewerTasks(): List<DynamicTest> = Fixtures.section("filters", "viewerTasks") { input ->
        Fixtures.strings(InsightsFilters.viewerTasks(input.tasks("tasks"), input.string("viewerId")).map { it.id })
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("filters", setOf("filterForInsights", "isTracked", "viewerTasks"))
}
