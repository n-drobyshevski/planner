package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.TrendsAnalytics
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.double
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.spans
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.DayUsage

/** Golden parity of [TrendsAnalytics] with lib/analytics/trends.ts (fixtures/trends.json). */
class TrendsFixturesTest {

    @TestFactory
    fun bucketUsage(): List<DynamicTest> = Fixtures.section("trends", "bucketUsage") { input ->
        Fixtures.array(
            TrendsAnalytics.bucketUsage(input.spans("spans"), input.buckets("buckets")).map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun rollingAverage(): List<DynamicTest> = Fixtures.section("trends", "rollingAverage") { input ->
        Fixtures.array(
            TrendsAnalytics.rollingAverage(input.perDay("perDay"), input.int("windowDays")).map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun categoryTrends(): List<DynamicTest> = Fixtures.section("trends", "categoryTrends") { input ->
        Fixtures.json(TrendsAnalytics.categoryTrends(input.spans("spans"), input.buckets("buckets"), input.int("topN")))
    }

    @TestFactory
    fun delta(): List<DynamicTest> = Fixtures.section("trends", "delta") { input ->
        Fixtures.json(TrendsAnalytics.delta(input.double("current"), input.double("previous")))
    }

    @Test
    fun sectionsCovered() =
        Fixtures.assertSections("trends", setOf("bucketUsage", "rollingAverage", "categoryTrends", "delta"))

    @Test
    fun `rolling average defaults to a 7-day window`() {
        val perDay = List(8) { DayUsage(it * DAY, if (it == 0) 8 * HOUR else HOUR) }
        assertEquals(HOUR.toDouble(), TrendsAnalytics.rollingAverage(perDay).last().avgMs)
    }

    @Test
    fun `rows keep the series order of seriesKeys`() {
        val t = TrendsAnalytics.categoryTrends(emptyList(), listOf(Bucket(0, DAY), Bucket(DAY, 2 * DAY)))
        assertEquals(emptyList(), t.seriesKeys)
        assertEquals(listOf(emptyMap<String, Long>(), emptyMap()), t.rows.map { it.byKey })
    }

    private companion object {
        const val HOUR = 3_600_000L
        const val DAY = 24 * HOUR
    }
}

/** `[{ start, end }]` → buckets. */
private fun JsonObject.buckets(k: String): List<Bucket> = getValue(k).jsonArray.map { Fixtures.window(it.jsonObject) }

/** `[{ dayMs, ms }]` → per-day rows. */
private fun JsonObject.perDay(k: String): List<DayUsage> =
    getValue(k).jsonArray.map { it.jsonObject.let { o -> DayUsage(o.long("dayMs"), o.long("ms")) } }
