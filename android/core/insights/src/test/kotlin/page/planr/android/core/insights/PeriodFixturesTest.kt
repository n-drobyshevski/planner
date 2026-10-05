package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.longOrNull
import page.planr.android.core.insights.fixtures.Fixtures.preset
import page.planr.android.core.insights.fixtures.Fixtures.strings
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.fixtures.Fixtures.zone
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.period.Periods

/**
 * Golden parity of [Periods] with lib/insights/period.ts over the zone matrix
 * (DST transitions, a midnight gap, exact day starts, a repeated hour).
 */
class PeriodFixturesTest {

    @TestFactory
    fun resolve(): List<DynamicTest> = Fixtures.section("period", "resolve") { input ->
        val zone = input.zone("zone")
        val now = input.long("now")
        val state = input.getValue("state").jsonObject
        val base = PeriodState(
            preset = state.preset("preset"),
            customFrom = state.longOrNull("customFrom"),
            customTo = state.longOrNull("customTo"),
        )
        val resolved = input.strings("granularities").map { id ->
            val requested = checkNotNull(Granularity.fromId(id))
            requested to Periods.resolve(base.copy(granularity = requested), zone, now).also(::assertTiles)
        }
        val first = resolved.first().second
        Fixtures.obj(
            "window" to Fixtures.json(first.window),
            "prevWindow" to Fixtures.json(first.prevWindow),
            "days" to Fixtures.longs(first.days),
            "prevDays" to Fixtures.longs(first.prevDays),
            "clamped" to JsonPrimitive(first.clamped),
            "byGranularity" to Fixtures.array(
                resolved.map { (requested, p) ->
                    Fixtures.obj(
                        "requested" to JsonPrimitive(requested.id),
                        "granularity" to JsonPrimitive(p.granularity.id),
                        // Day buckets are the day list; the fixture keeps them out for size.
                        "bucketStarts" to if (p.granularity == Granularity.Day) {
                            assertEquals(p.days, p.buckets.map { it.start }, "day buckets are the days")
                            JsonNull
                        } else {
                            Fixtures.longs(p.buckets.map { it.start })
                        },
                    )
                },
            ),
        )
    }

    @TestFactory
    fun granularityChoices(): List<DynamicTest> = Fixtures.section("period", "granularityChoices") { input ->
        Fixtures.strings(Periods.granularityChoices(input.window("window")).map { it.id })
    }

    @TestFactory
    fun defaultGranularity(): List<DynamicTest> = Fixtures.section("period", "defaultGranularity") { input ->
        JsonPrimitive(Periods.defaultGranularity(input.preset("preset"), input.window("window")).id)
    }

    @Test
    fun sectionsCovered() =
        Fixtures.assertSections("period", setOf("resolve", "granularityChoices", "defaultGranularity"))

    /**
     * Buckets are contiguous and end at the window's end; week / month buckets
     * start at the window's start. Day buckets start at the first day's
     * midnight, which is before the window's start when the window is anchored
     * on a DST-gap day's 01:00 (web parity, see [Periods]).
     */
    private fun assertTiles(p: ResolvedPeriod) {
        val first = if (p.granularity == Granularity.Day) p.days.first() else p.window.start
        assertEquals(first, p.buckets.first().start, "first bucket start")
        p.buckets.zipWithNext().forEach { (a, b) -> assertEquals(a.end, b.start, "buckets tile") }
        assertEquals(p.window.end, p.buckets.last().end, "last bucket ends the window")
        assertEquals(p.window.start, p.prevWindow.end, "the previous window ends where the window starts")
    }
}
