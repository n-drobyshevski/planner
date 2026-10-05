package page.planr.android.core.insights.selectors

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.double
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.stringOrNull
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.CategoryUsage
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Usage
import page.planr.android.core.insights.model.UsageSummary

/** Golden parity of [OverviewSelectors] with view-selectors.ts, Overview group (fixtures/selectors-overview.json). */
class OverviewSelectorsTest {

    @TestFactory
    fun perDaySeries(): List<DynamicTest> = Fixtures.section(AREA, "perDaySeries") { input ->
        Fixtures.array(
            OverviewSelectors.perDaySeries(usage(input.days("cur")), usage(input.days("prev"))).map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun typicalDayMs(): List<DynamicTest> = Fixtures.section(AREA, "typicalDayMs") { input ->
        Fixtures.num(OverviewSelectors.typicalDayMs(input.days("cur"), input.days("prev")))
    }

    @TestFactory
    fun shareRows(): List<DynamicTest> = Fixtures.section(AREA, "shareRows") { input ->
        val byCategory = input.objects("byCategory").map { CategoryUsage(it.stringOrNull("categoryId"), it.long("ms")) }
        Fixtures.array(OverviewSelectors.shareRows(byCategory).map { Fixtures.json(it) })
    }

    @TestFactory
    fun shiftChips(): List<DynamicTest> = Fixtures.section(AREA, "shiftChips") { input ->
        val shares = input.objects("shares").map(::share)
        Fixtures.array(
            OverviewSelectors.shiftChips(shares, input.long("curTotal"), input.long("prevTotal")).map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun totalChange(): List<DynamicTest> = Fixtures.section(AREA, "totalChange") { input ->
        Fixtures.json(OverviewSelectors.totalChange(input.long("total"), input.long("prevTotal")))
    }

    @TestFactory
    fun avgSessionMs(): List<DynamicTest> = Fixtures.section(AREA, "avgSessionMs") { input ->
        Fixtures.num(OverviewSelectors.avgSessionMs(summary(input.getValue("summary").jsonObject)))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections(
        AREA,
        setOf("perDaySeries", "typicalDayMs", "shareRows", "shiftChips", "totalChange", "avgSessionMs"),
    )

    @Test
    fun `shift points round half up like Math round`() {
        assertEquals(3, OverviewSelectors.shiftPoints(0.025))
        assertEquals(-2, OverviewSelectors.shiftPoints(-0.025))
        assertEquals(-30, OverviewSelectors.shiftPoints(-0.3))
    }

    @Test
    fun `shiftChips does not mutate its input`() {
        val shares = listOf(share("a", 0.05), share("b", -0.3), share("c", 0.1))
        val before = shares.toList()
        OverviewSelectors.shiftChips(shares, 1, 1)
        assertEquals(before, shares)
    }

    private fun share(id: String, deltaShare: Double) = CategoryShare(id, 1, 0.5, 1, 0.5 - deltaShare, deltaShare)

    private companion object {
        const val AREA = "selectors-overview"
    }
}

/** A Usage whose only populated field is [perDay] (all the per-day selectors read). */
private fun usage(perDay: List<DayUsage>): Usage =
    Usage(UsageSummary(0, 0, 0, 0.0, null), perDay, emptyList(), emptyList())

private fun JsonObject.objects(k: String): List<JsonObject> = getValue(k).jsonArray.map { it.jsonObject }

private fun JsonObject.days(k: String): List<DayUsage> = objects(k).map(::day)

private fun day(o: JsonObject): DayUsage = DayUsage(o.long("dayMs"), o.long("ms"))

private fun share(o: JsonObject): CategoryShare = CategoryShare(
    categoryId = o.stringOrNull("categoryId"),
    ms = o.long("ms"),
    share = o.double("share"),
    prevMs = o.long("prevMs"),
    prevShare = o.double("prevShare"),
    deltaShare = o.double("deltaShare"),
)

private fun summary(o: JsonObject): UsageSummary = UsageSummary(
    totalMs = o.long("totalMs"),
    eventCount = o.int("eventCount"),
    activeDays = o.int("activeDays"),
    dailyAverageMs = o.double("dailyAverageMs"),
    busiestDay = o["busiestDay"]?.takeIf { it !is JsonNull }?.let { day(it.jsonObject) },
)
