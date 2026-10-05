package page.planr.android.core.insights

import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.PatternsAnalytics
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.longs
import page.planr.android.core.insights.fixtures.Fixtures.spans
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.fixtures.Fixtures.zone
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.Span
import page.planr.android.core.model.EventKind

/** Golden parity of [PatternsAnalytics] with lib/analytics/patterns.ts (DST nights, a midnight gap, Kolkata). */
class PatternsFixturesTest {

    @TestFactory
    fun byWeekday(): List<DynamicTest> = Fixtures.section("patterns", "byWeekday") { input ->
        Fixtures.array(
            PatternsAnalytics.byWeekday(input.spans("spans"), input.longs("days"), input.window("window"), input.zone("zone"))
                .map { Fixtures.json(it) },
        )
    }

    @TestFactory
    fun hourHeatmap(): List<DynamicTest> = Fixtures.section("patterns", "hourHeatmap") { input ->
        Fixtures.json(PatternsAnalytics.hourHeatmap(input.spans("spans"), input.window("window"), input.zone("zone")))
    }

    @TestFactory
    fun fragmentation(): List<DynamicTest> = Fixtures.section("patterns", "fragmentation") { input ->
        Fixtures.json(PatternsAnalytics.fragmentation(input.spans("spans"), input.window("window"), input.zone("zone")))
    }

    @TestFactory
    fun nextHourBoundary(): List<DynamicTest> = Fixtures.section("patterns", "nextHourBoundary") { input ->
        JsonPrimitive(PatternsAnalytics.nextHourBoundary(input.long("ms"), input.zone("zone")))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections(
        "patterns",
        setOf("byWeekday", "hourHeatmap", "fragmentation", "nextHourBoundary"),
    )

    // The fixture keeps only each cell's ms; the labels must follow the index.
    @Test
    fun heatmapCellsAreIndexedWeekdayMajor() {
        val cells = PatternsAnalytics.hourHeatmap(emptyList(), MsWindow(0, 0), ZoneId.of("UTC")).cells
        assertEquals(168, cells.size)
        cells.forEachIndexed { i, c ->
            assertEquals(i / 24, c.weekday)
            assertEquals(i % 24, c.hour)
        }
    }

    @Test
    fun berlinRepeatedHourAccumulatesTwiceIntoOneCell() {
        // 2026-10-25 01:30 CEST → 03:30 CET (Sunday): local 02:xx happens twice.
        val berlin = ZoneId.of("Europe/Berlin")
        val day = MsWindow(utc("2026-10-24T22:00:00Z"), utc("2026-10-25T23:00:00Z"))
        val h = PatternsAnalytics.hourHeatmap(listOf(span(utc("2026-10-24T23:30:00Z"), utc("2026-10-25T02:30:00Z"))), day, berlin)
        val sunday = { hour: Int -> h.cells[6 * 24 + hour].ms }
        assertEquals(HALF_HOUR, sunday(1))
        assertEquals(2 * HOUR, sunday(2))
        assertEquals(HALF_HOUR, sunday(3))
        assertEquals(2 * HOUR, h.maxMs)
    }

    @Test
    fun santiagoDayStartingAtOneIsASunday() {
        // 2026-09-06: local midnight is skipped, the day starts at 01:00 (04:00Z).
        val santiago = ZoneId.of("America/Santiago")
        val dayStart = utc("2026-09-06T04:00:00Z")
        val rows = PatternsAnalytics.byWeekday(
            listOf(span(utc("2026-09-06T03:30:00Z"), utc("2026-09-06T04:30:00Z"))),
            listOf(utc("2026-09-05T04:00:00Z"), dayStart),
            MsWindow(utc("2026-09-05T04:00:00Z"), utc("2026-09-07T03:00:00Z")),
            santiago,
        )
        assertEquals(HALF_HOUR, rows[5].totalMs) // Saturday 23:30–24:00
        assertEquals(HALF_HOUR, rows[6].totalMs) // Sunday 01:00–01:30
        val f = PatternsAnalytics.fragmentation(
            listOf(span(utc("2026-09-06T03:30:00Z"), utc("2026-09-06T04:30:00Z"))),
            MsWindow(utc("2026-09-05T04:00:00Z"), utc("2026-09-07T03:00:00Z")),
            santiago,
        )
        assertEquals(2, f.blockCount)
        assertEquals(HALF_HOUR, f.longestBlockMs)
    }

    @Test
    fun nextHourBoundaryInsideAnOverlapIsTheNextInstantHour() {
        // 02:30 CEST (00:30Z) → 03:00 CEST = 02:00 CET (01:00Z), not 03:00 CET.
        val berlin = ZoneId.of("Europe/Berlin")
        assertEquals(utc("2026-10-25T01:00:00Z"), PatternsAnalytics.nextHourBoundary(utc("2026-10-25T00:30:00Z"), berlin))
        // Kolkata (+05:30): local :00 is UTC :30.
        val kolkata = ZoneId.of("Asia/Kolkata")
        assertEquals(utc("2026-06-10T04:30:00Z"), PatternsAnalytics.nextHourBoundary(utc("2026-06-10T04:00:00.250Z"), kolkata))
    }

    private companion object {
        const val HOUR = 3_600_000L
        const val HALF_HOUR = HOUR / 2

        fun utc(iso: String): Long = java.time.Instant.parse(iso).toEpochMilli()

        fun span(start: Long, end: Long) = Span(
            key = "k$start",
            eventId = "e",
            title = "t",
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
