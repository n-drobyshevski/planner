package page.planr.android.core.insights.selectors

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.double
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.longOrNull
import page.planr.android.core.insights.fixtures.Fixtures.longs
import page.planr.android.core.insights.fixtures.Fixtures.string
import page.planr.android.core.insights.model.DaypartRating
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.DeepWorkShare
import page.planr.android.core.insights.model.EnergyDayLoad
import page.planr.android.core.insights.model.EnergySummary
import page.planr.android.core.insights.model.HeatmapCell
import page.planr.android.core.insights.model.RatedAggregate
import page.planr.android.core.insights.model.WeekdayUsage

/** Golden parity of [PatternsSelectors] and [HeatmapSteps] with view-selectors.ts (area "selectors-patterns"). */
class PatternsSelectorsTest {

    @TestFactory
    fun topWeekday(): List<DynamicTest> = Fixtures.section(AREA, "topWeekday") { input ->
        Fixtures.json(PatternsSelectors.topWeekday(weekdays(input)))
    }

    @TestFactory
    fun bestDaypart(): List<DynamicTest> = Fixtures.section(AREA, "bestDaypart") { input ->
        Fixtures.json(PatternsSelectors.bestDaypart(dayparts(input)))
    }

    @TestFactory
    fun worstDaypart(): List<DynamicTest> = Fixtures.section(AREA, "worstDaypart") { input ->
        Fixtures.json(PatternsSelectors.worstDaypart(dayparts(input)))
    }

    @TestFactory
    fun energySummary(): List<DynamicTest> = Fixtures.section(AREA, "energySummary") { input ->
        val days = input.getValue("days").jsonArray.map { it.jsonObject }.map {
            EnergyDayLoad(it.long("dayMs"), it.long("weightedMs"), it.long("ratedMs"), it.long("totalMs"))
        }
        Fixtures.json(PatternsSelectors.energySummary(days))
    }

    @TestFactory
    fun hasAttributes(): List<DynamicTest> = Fixtures.section(AREA, "hasAttributes") { input ->
        val deep = input.getValue("deep").jsonObject
        val energy = input.getValue("energy").jsonObject
        JsonPrimitive(
            PatternsSelectors.hasAttributes(
                deep = DeepWorkShare(deep.long("deepMs"), deep.long("shallowMs"), deep.long("unratedMs"), deep.doubleOrNull("share")),
                best = daypart(input.getValue("best")),
                energy = EnergySummary(
                    meanEnergy = energy.doubleOrNull("meanEnergy"),
                    ratedMs = energy.long("ratedMs"),
                    totalMs = energy.long("totalMs"),
                    coveragePct = energy.longOrNull("coveragePct")?.toInt(),
                ),
            ),
        )
    }

    @TestFactory
    fun weekdayTotal(): List<DynamicTest> = Fixtures.section(AREA, "weekdayTotal") { input ->
        JsonPrimitive(PatternsSelectors.weekdayTotal(weekdays(input)))
    }

    @TestFactory
    fun stepOf(): List<DynamicTest> = Fixtures.section(AREA, "stepOf") { input ->
        JsonPrimitive(HeatmapSteps.stepOf(input.long("ms")))
    }

    @TestFactory
    fun heatmapBands(): List<DynamicTest> = Fixtures.section(AREA, "heatmapBands") { input ->
        // Compact cells: index weekday * 24 + hour.
        val cells = input.longs("cells").mapIndexed { i, ms -> HeatmapCell(weekday = i / 24, hour = i % 24, ms = ms) }
        Fixtures.longs(HeatmapSteps.bands(cells))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections(
        AREA,
        setOf(
            "topWeekday",
            "bestDaypart",
            "worstDaypart",
            "energySummary",
            "hasAttributes",
            "weekdayTotal",
            "stepOf",
            "heatmapBands",
        ),
    )

    // view-selectors.ts exports these constants; the fixtures only see their effect.
    @Test
    fun constants() {
        assertEquals(5, PatternsSelectors.MIN_DAYPART_RATINGS)
        assertContentEquals(floatArrayOf(0f, 0.25f, 0.45f, 0.70f, 1f), HeatmapSteps.STEP_ALPHA)
    }

    @Test
    fun `bands keep every millisecond of the cells`() {
        val cells = (0 until 7 * 24).map { HeatmapCell(it / 24, it % 24, it * 1_000L + 7) }
        val bands = HeatmapSteps.bands(cells)
        assertEquals(42, bands.size)
        assertEquals(cells.sumOf { it.ms }, bands.sum())
    }

    private fun weekdays(input: JsonObject): List<WeekdayUsage> = input.getValue("rows").jsonArray.map { it.jsonObject }.map {
        WeekdayUsage(it.int("weekday"), it.long("totalMs"), it.double("avgMs"), it.int("dayCount"))
    }

    private fun dayparts(input: JsonObject): List<DaypartRating> =
        input.getValue("rows").jsonArray.map { requireNotNull(daypart(it)) }

    private fun daypart(e: JsonElement): DaypartRating? {
        if (e is JsonNull) return null
        val o = e.jsonObject
        val agg = o.getValue("agg").jsonObject
        return DaypartRating(
            daypart = Daypart.entries.first { it.id == o.string("daypart") },
            agg = RatedAggregate(agg.double("mean"), agg.int("n"), agg.getValue("ms").jsonPrimitive.long),
        )
    }

    private fun JsonObject.doubleOrNull(k: String): Double? = (get(k) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.toDouble()

    private companion object {
        const val AREA = "selectors-patterns"
    }
}
