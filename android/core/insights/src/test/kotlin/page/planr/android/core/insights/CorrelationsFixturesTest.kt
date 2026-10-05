package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.CorrelationsAnalytics
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.longs
import page.planr.android.core.insights.fixtures.Fixtures.spans
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.fixtures.Fixtures.zone
import page.planr.android.core.insights.model.Daypart

/** Golden parity of [CorrelationsAnalytics] with lib/analytics/correlations.ts. */
class CorrelationsFixturesTest {

    @TestFactory
    fun satisfactionByCategory(): List<DynamicTest> = Fixtures.section("correlations", "satisfactionByCategory") { input ->
        Fixtures.array(
            CorrelationsAnalytics.satisfactionByCategory(input.spans("spans"), input.window("window")).map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun energyLoadPerDay(): List<DynamicTest> = Fixtures.section("correlations", "energyLoadPerDay") { input ->
        Fixtures.array(
            CorrelationsAnalytics.energyLoadPerDay(input.spans("spans"), input.longs("days"), input.window("window"))
                .map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun deepWorkShare(): List<DynamicTest> = Fixtures.section("correlations", "deepWorkShare") { input ->
        Fixtures.json(CorrelationsAnalytics.deepWorkShare(input.spans("spans"), input.window("window")))
    }

    @TestFactory
    fun satisfactionByDaypart(): List<DynamicTest> = Fixtures.section("correlations", "satisfactionByDaypart") { input ->
        Fixtures.array(
            CorrelationsAnalytics.satisfactionByDaypart(input.spans("spans"), input.window("window"), input.zone("zone"))
                .map { Fixtures.json(it) },
        )
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections(
        "correlations",
        setOf("satisfactionByCategory", "energyLoadPerDay", "deepWorkShare", "satisfactionByDaypart"),
    )

    // correlations.test.ts imports these two constants; daypartOfHour is private on the web.
    @Test
    fun constants() {
        assertEquals(5, CorrelationsAnalytics.MIN_CATEGORY_RATINGS)
        assertEquals(listOf("morning", "midday", "evening", "night"), CorrelationsAnalytics.DAYPARTS.map { it.id })
    }

    @Test
    fun daypartOfHourCoversTheClock() {
        val expected = (0 until 24).map { hour ->
            when (hour) {
                in 5..11 -> Daypart.Morning
                in 12..16 -> Daypart.Midday
                in 17..21 -> Daypart.Evening
                else -> Daypart.Night
            }
        }
        assertEquals(expected, (0 until 24).map(CorrelationsAnalytics::daypartOfHour))
    }
}
