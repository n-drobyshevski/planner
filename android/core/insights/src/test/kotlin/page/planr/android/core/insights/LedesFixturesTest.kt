package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.double
import page.planr.android.core.insights.fixtures.Fixtures.granularity
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.preset
import page.planr.android.core.insights.fixtures.Fixtures.string
import page.planr.android.core.insights.fixtures.Fixtures.stringOrNull
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeTone
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.TopContext
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.TrendKind
import page.planr.android.core.insights.model.WeekdayUsage

/** Golden parity of [Ledes] with lib/insights/ledes.ts, as `{ tone, key, args }` (fixtures/ledes.json). */
class LedesFixturesTest {

    @TestFactory
    fun comparisonNoun(): List<DynamicTest> = Fixtures.section("ledes", "comparisonNoun") { input ->
        JsonPrimitive(Ledes.comparisonNoun(input.preset("preset")).id)
    }

    @TestFactory
    fun overview(): List<DynamicTest> = Fixtures.section("ledes", "overview") { input ->
        Fixtures.json(
            Ledes.overview(
                totalMs = input.long("totalMs"),
                prevTotalMs = input.long("prevTotalMs"),
                preset = input.preset("preset"),
                topContext = input.objectOrNull("topContext")?.let { TopContext(it.string("seriesKey"), it.long("ms")) },
            ),
        )
    }

    @TestFactory
    fun trends(): List<DynamicTest> = Fixtures.section("ledes", "trends") { input ->
        val trend = input.getValue("trend").jsonObject
        Fixtures.json(
            Ledes.trends(
                trend = TrendDirection(
                    slopeMsPerBucket = trend.doubleOrNull("slopeMsPerBucket"),
                    direction = trend.stringOrNull("direction")?.let { id -> TrendKind.entries.single { it.id == id } },
                ),
                granularity = input.granularity("granularity"),
                busiest = input.objectOrNull("busiest")?.let { BucketUsage(it.long("start"), it.long("end"), it.long("ms")) },
            ),
        )
    }

    @TestFactory
    fun patterns(): List<DynamicTest> = Fixtures.section("ledes", "patterns") { input ->
        Fixtures.json(
            Ledes.patterns(
                topWeekday = input.objectOrNull("topWeekday")?.let {
                    WeekdayUsage(weekday = it.int("weekday"), totalMs = 0, avgMs = it.double("avgMs"), dayCount = 0)
                },
                bestDaypart = input.stringOrNull("bestDaypart")?.let { id -> Daypart.entries.single { it.id == id } },
                medianBlockMs = input.doubleOrNull("medianBlockMs"),
            ),
        )
    }

    @TestFactory
    fun tasks(): List<DynamicTest> = Fixtures.section("ledes", "tasks") { input ->
        Fixtures.json(
            Ledes.tasks(
                stats = taskStats(input.getValue("stats").jsonObject),
                prevStats = taskStats(input.getValue("prevStats").jsonObject),
                preset = input.preset("preset"),
            ),
        )
    }

    @Test
    fun sectionsCovered() =
        Fixtures.assertSections("ledes", setOf("comparisonNoun", "overview", "trends", "patterns", "tasks"))

    @Test
    fun `lines keep the arguments in the web's call order`() {
        val lede = Ledes.overview(31 * HOUR, 28 * HOUR, PeriodPreset.ThisWeek, TopContext("c1", 14 * HOUR))!!
        assertEquals(listOf("total", "direction", "unit", "pct", "magnitude"), lede.headline.args.keys.toList())
        val trends = Ledes.trends(TrendDirection(-2.0 * HOUR, TrendKind.Down), Granularity.Week, null)
        assertEquals(listOf("direction", "granularity", "hasRate", "sign", "rate"), trends.headline.args.keys.toList())
        assertEquals(LedeArg.Select("−"), trends.headline.args["sign"])
        assertNull(trends.support)
    }

    @Test
    fun `only overdue tasks raise attention`() {
        val none = TaskStats(0, 0, 0, null, 0, null, null)
        assertEquals(LedeTone.Attention, Ledes.tasks(none.copy(overdueOpenCount = 1), none, PeriodPreset.ThisWeek).tone)
        assertEquals(LedeTone.Neutral, Ledes.tasks(none.copy(completedCount = 9), none, PeriodPreset.ThisWeek).tone)
    }

    @Test
    fun `a direction without a slope keeps the rate clause off`() {
        // bucketTrend never returns this pair; the web would pass rate "" and hasRate "no".
        val lede = Ledes.trends(TrendDirection(null, TrendKind.Up), Granularity.Day, null)
        assertEquals(LedeArg.Select("no"), lede.headline.args["hasRate"])
        assertEquals(LedeArg.Select("−"), lede.headline.args["sign"])
    }

    private fun taskStats(o: JsonObject) = TaskStats(
        createdCount = o.int("createdCount"),
        completedCount = o.int("completedCount"),
        dueCount = o.int("dueCount"),
        adherenceRate = o.doubleOrNull("adherenceRate"),
        overdueOpenCount = o.int("overdueOpenCount"),
        completionRate = o.doubleOrNull("completionRate"),
        medianLeadTimeMs = o.doubleOrNull("medianLeadTimeMs"),
    )

    private fun JsonObject.objectOrNull(k: String): JsonObject? = get(k)?.takeIf { it !is JsonNull }?.jsonObject

    private fun JsonObject.doubleOrNull(k: String): Double? = get(k)?.takeIf { it !is JsonNull }?.let { double(k) }

    private companion object {
        const val HOUR = 3_600_000L
    }
}
