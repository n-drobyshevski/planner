package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.UsageAnalytics
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.boolean
import page.planr.android.core.insights.fixtures.Fixtures.longs
import page.planr.android.core.insights.fixtures.Fixtures.spans
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span
import page.planr.android.core.model.EventKind

/** Golden parity of [UsageAnalytics] with lib/analytics/usage.ts (fixtures/usage.json). */
class UsageFixturesTest {

    @TestFactory
    fun computeUsage(): List<DynamicTest> = Fixtures.section("usage", "computeUsage") { input ->
        Fixtures.json(
            UsageAnalytics.computeUsage(
                spans = input.spans("spans"),
                days = input.longs("days"),
                window = input.window("window"),
                includeInactive = input.boolean("includeInactive"),
            ),
        )
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("usage", setOf("computeUsage"))

    @Test
    fun `per-day buckets tile the window, so they sum to the total`() {
        val spans = listOf(span("a", -HOUR, 3 * HOUR), span("b", DAY - HOUR, DAY + 2 * HOUR), span("c", 2 * DAY, 4 * DAY))
        val usage = UsageAnalytics.computeUsage(spans, listOf(0L, DAY, 2 * DAY), MsWindow(0, 3 * DAY))
        assertEquals(usage.summary.totalMs, usage.perDay.sumOf { it.ms })
        assertEquals(3, usage.summary.eventCount)
    }

    @Test
    fun `totals stay Long past the Int range`() {
        val year = 366 * DAY
        val usage = UsageAnalytics.computeUsage(listOf(span("long", 0, year)), listOf(0L), MsWindow(0, year))
        assertEquals(year, usage.summary.totalMs)
        assertEquals(year.toDouble(), usage.summary.dailyAverageMs)
    }

    private companion object {
        const val HOUR = 3_600_000L
        const val DAY = 24 * HOUR

        fun span(key: String, start: Long, end: Long) = Span(
            key = key,
            eventId = key,
            title = key,
            start = start,
            end = end,
            kind = EventKind.Event,
            allDay = false,
            inactive = false,
            ownerId = "me",
            isShared = false,
            categoryId = null,
            attributes = Attributes.None,
        )
    }
}
