package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.MomentumAnalytics
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.TrendKind

/** Golden parity of [MomentumAnalytics] with lib/analytics/momentum.ts (fixtures/momentum.json). */
class MomentumFixturesTest {

    @TestFactory
    fun bucketTrend(): List<DynamicTest> = Fixtures.section("momentum", "bucketTrend") { input ->
        val buckets = input.getValue("buckets").jsonArray.map {
            it.jsonObject.let { o -> BucketUsage(o.long("start"), o.long("end"), o.long("ms")) }
        }
        Fixtures.json(MomentumAnalytics.bucketTrend(buckets))
    }

    @TestFactory
    fun activeStreak(): List<DynamicTest> = Fixtures.section("momentum", "activeStreak") { input ->
        Fixtures.json(MomentumAnalytics.activeStreak(input.perDay("perDay"), input.long("minMsPerDay")))
    }

    @TestFactory
    fun consistency(): List<DynamicTest> = Fixtures.section("momentum", "consistency") { input ->
        Fixtures.num(MomentumAnalytics.consistency(input.perDay("perDay")))
    }

    @TestFactory
    fun dayAnomalies(): List<DynamicTest> = Fixtures.section("momentum", "dayAnomalies") { input ->
        // null in the fixture = the TS default.
        val minSample = input.getValue("minSample").takeIf { it !is JsonNull }?.jsonPrimitive?.content?.toInt()
        val zThreshold = input.getValue("zThreshold").takeIf { it !is JsonNull }?.jsonPrimitive?.content?.toDouble()
        val anomalies = MomentumAnalytics.dayAnomalies(
            perDay = input.perDay("perDay"),
            minSample = minSample ?: MomentumAnalytics.DEFAULT_ANOMALY_MIN_SAMPLE,
            zThreshold = zThreshold ?: MomentumAnalytics.DEFAULT_ANOMALY_Z,
        )
        Fixtures.array(anomalies.map { Fixtures.json(it) })
    }

    @Test
    fun sectionsCovered() =
        Fixtures.assertSections("momentum", setOf("bucketTrend", "activeStreak", "consistency", "dayAnomalies"))

    @Test
    fun `defaults match the TS constants`() {
        val base = List(14) { if (it % 2 == 0) 9.5 else 10.5 } + 14.0
        val days = base.mapIndexed { i, h -> DayUsage(i * DAY, (h * HOUR).toLong()) }
        assertEquals(emptyList(), MomentumAnalytics.dayAnomalies(days))
        assertEquals(1, MomentumAnalytics.dayAnomalies(days, zThreshold = 2.0).size)
        assertEquals(1, MomentumAnalytics.activeStreak(listOf(DayUsage(0, 1))).current)
    }

    @Test
    fun `an all-zero series is flat with a zero slope`() {
        val zeros = List(4) { BucketUsage(it * DAY, (it + 1) * DAY, 0) }
        assertEquals(TrendDirection(0.0, TrendKind.Flat), MomentumAnalytics.bucketTrend(zeros))
    }

    private companion object {
        const val HOUR = 3_600_000L
        const val DAY = 24 * HOUR
    }
}

/** `[{ dayMs, ms }]` → per-day rows. */
private fun JsonObject.perDay(k: String): List<DayUsage> =
    getValue(k).jsonArray.map { it.jsonObject.let { o -> DayUsage(o.long("dayMs"), o.long("ms")) } }
