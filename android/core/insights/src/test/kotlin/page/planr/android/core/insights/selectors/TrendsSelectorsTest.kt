package page.planr.android.core.insights.selectors

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonArray
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
import page.planr.android.core.insights.fixtures.Fixtures.granularity
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.string
import page.planr.android.core.insights.fixtures.Fixtures.stringOrNull
import page.planr.android.core.insights.model.Anomaly
import page.planr.android.core.insights.model.AnomalyDirection
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.CategoryBucketRow
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.Streak
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.TrendKind

/** Golden parity of [TrendsSelectors] with view-selectors.ts, Trends group (fixtures/selectors-trends.json). */
class TrendsSelectorsTest {

    @TestFactory
    fun busiestBucket(): List<DynamicTest> = Fixtures.section(AREA, "busiestBucket") { input ->
        Fixtures.json(TrendsSelectors.busiest(input.buckets("rows")))
    }

    @TestFactory
    fun perDayFromBuckets(): List<DynamicTest> = Fixtures.section(AREA, "perDayFromBuckets") { input ->
        TrendsSelectors.perDay(input.buckets("buckets"), input.granularity("granularity"))
            ?.let { days -> Fixtures.array(days.map { Fixtures.json(it) }) }
            ?: JsonNull
    }

    @TestFactory
    fun categoryTotals(): List<DynamicTest> = Fixtures.section(AREA, "categoryTotals") { input ->
        // A list of entries, so the comparator also checks the Map's order.
        totalsJson(TrendsSelectors.categoryTotals(input.categoryBuckets("cb")))
    }

    @TestFactory
    fun topCategory(): List<DynamicTest> = Fixtures.section(AREA, "topCategory") { input ->
        val totals = input.getValue("totals").jsonArray.associateTo(LinkedHashMap()) {
            it.jsonObject.string("key") to it.jsonObject.long("ms")
        }
        Fixtures.str(TrendsSelectors.topCategory(input.categoryBuckets("cb"), totals))
    }

    @TestFactory
    fun showMomentum(): List<DynamicTest> = Fixtures.section(AREA, "showMomentum") { input ->
        val perDay = (input.getValue("perDay") as? JsonArray)?.map {
            it.jsonObject.let { o -> DayUsage(o.long("dayMs"), o.long("ms")) }
        }
        val streak = (input.getValue("streak") as? JsonObject)?.let { Streak(it.int("current"), it.int("longest")) }
        val anomalies = input.getValue("anomalies").jsonArray.map {
            it.jsonObject.let { o ->
                Anomaly(o.long("dayMs"), o.long("ms"), o.double("z"), AnomalyDirection.valueOf(o.string("direction").cap()))
            }
        }
        val trend = input.getValue("trend").jsonObject.let { o ->
            TrendDirection(
                slopeMsPerBucket = o.getValue("slopeMsPerBucket").takeIf { it !is JsonNull }?.jsonPrimitive?.content?.toDouble(),
                direction = o.stringOrNull("direction")?.let { TrendKind.valueOf(it.cap()) },
            )
        }
        val steadiness = input.getValue("steadiness").takeIf { it !is JsonNull }?.jsonPrimitive?.content?.toDouble()
        JsonPrimitive(TrendsSelectors.showMomentum(perDay, streak, steadiness, anomalies, trend))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections(
        AREA,
        setOf("busiestBucket", "perDayFromBuckets", "categoryTotals", "topCategory", "showMomentum"),
    )

    @Test
    fun `busiest keeps the first of equal maxima and does not need a sorted input`() {
        val buckets = listOf(BucketUsage(0, 1, 2), BucketUsage(1, 2, 7), BucketUsage(2, 3, 7))
        assertEquals(buckets[1], TrendsSelectors.busiest(buckets))
        assertNull(TrendsSelectors.busiest(emptyList()))
    }

    @Test
    fun `momentum needs a day series, even an empty one counts`() {
        val none = TrendDirection(null, null)
        assertFalse(TrendsSelectors.showMomentum(null, Streak(3, 3), 0.5, emptyList(), none))
        assertTrue(TrendsSelectors.showMomentum(emptyList(), null, null, emptyList(), TrendDirection(0.0, TrendKind.Flat)))
        assertFalse(TrendsSelectors.showMomentum(emptyList(), null, null, emptyList(), none))
        assertEquals(null, TrendsSelectors.perDay(listOf(BucketUsage(0, 1, 2)), Granularity.Week))
    }

    private companion object {
        const val AREA = "selectors-trends"
    }
}

/** `[{ start, end, ms }]` → buckets. */
private fun JsonObject.buckets(k: String): List<BucketUsage> = getValue(k).jsonArray.map {
    it.jsonObject.let { o -> BucketUsage(o.long("start"), o.long("end"), o.long("ms")) }
}

/** `{ seriesKeys, rows: [{ start, end, byKey }] }`, byKey in its JSON (= TS insertion) order. */
private fun JsonObject.categoryBuckets(k: String): CategoryBuckets {
    val o = getValue(k).jsonObject
    return CategoryBuckets(
        seriesKeys = o.getValue("seriesKeys").jsonArray.map { it.jsonPrimitive.content },
        rows = o.getValue("rows").jsonArray.map { row ->
            row.jsonObject.let { r ->
                CategoryBucketRow(
                    start = r.long("start"),
                    end = r.long("end"),
                    byKey = r.getValue("byKey").jsonObject.entries.associateTo(LinkedHashMap()) { (key, ms) ->
                        key to ms.jsonPrimitive.long
                    },
                )
            }
        },
    )
}

private fun totalsJson(totals: Map<String, Long>): JsonElement =
    Fixtures.array(totals.map { (key, ms) -> Fixtures.obj("key" to JsonPrimitive(key), "ms" to JsonPrimitive(ms)) })

/** "high" → "High" (the enums' Kotlin names). */
private fun String.cap(): String = replaceFirstChar { it.uppercaseChar() }
