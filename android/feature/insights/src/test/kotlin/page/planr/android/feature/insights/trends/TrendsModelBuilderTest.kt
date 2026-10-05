package page.planr.android.feature.insights.trends

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import page.planr.android.core.insights.analytics.MomentumAnalytics
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.Streak
import page.planr.android.core.insights.model.TrendKind
import page.planr.android.feature.insights.BERLIN
import page.planr.android.feature.insights.BORIS
import page.planr.android.feature.insights.annaWork
import page.planr.android.feature.insights.inputs
import page.planr.android.feature.insights.sharedHome
import page.planr.android.feature.insights.span

class TrendsModelBuilderTest {

    @Test
    fun `an empty period is empty, with no series and no unusual days`() {
        val model = buildTrendsModel(inputs())

        assertEquals(0L, model.totalMs)
        assertEquals(7, model.buckets.size)
        assertTrue(model.buckets.all { it.ms == 0L })
        assertTrue(model.byContext.seriesKeys.isEmpty())
        assertTrue(model.categoryTotals.isEmpty())
        assertNull(model.topCategoryKey)
        assertTrue(model.anomalies.isEmpty())
        // Every day of this week has elapsed by Sunday, none of them tracked.
        assertEquals(Streak(0, 0), model.streak)
    }

    @Test
    fun `week buckets have no rolling average and no momentum`() {
        val day = at(LocalDate.of(2026, 9, 14), 9)
        val model = buildTrendsModel(
            inputs(
                spans = listOf(span("a", day, day + 2 * HOUR), span("b", day + 7 * DAY, day + 7 * DAY + HOUR)),
                state = PeriodState(preset = PeriodPreset.Last90d, granularity = Granularity.Week),
            ),
        )

        assertEquals(Granularity.Week, model.granularity)
        assertEquals(3 * HOUR, model.totalMs)
        assertNull(model.rolling)
        assertNull(model.streak)
        assertNull(model.consistency)
        assertTrue(model.anomalies.isEmpty())
        assertFalse(model.showMomentum)
        // The busiest week holds the 2h block; its week starts on Monday 14 September.
        assertEquals(at(LocalDate.of(2026, 9, 14), 0), assertNotNull(model.busiest).start)
        assertEquals(2 * HOUR, model.busiest?.ms)
        assertEquals("lede.trendsSupport", model.lede.support?.key)
    }

    @Test
    fun `the streak counts back from today, not from the window's last day`() {
        // This week, today Wednesday 30 September at noon, tracked Monday to Wednesday.
        val monday = LocalDate.of(2026, 9, 28)
        val now = at(monday.plusDays(2), 12)
        val spans = (0L..2L).map { i -> span("d$i", at(monday.plusDays(i), 9), at(monday.plusDays(i), 10)) }
        val model = buildTrendsModel(inputs(spans = spans, state = PeriodState(preset = PeriodPreset.ThisWeek), now = now))

        assertEquals(Granularity.Day, model.granularity)
        assertEquals(Streak(current = 3, longest = 3), model.streak)
        // The web's untrimmed streak ends on Sunday's empty day.
        val perDay = model.buckets.map { DayUsage(it.start, it.ms) }
        assertEquals(0, MomentumAnalytics.activeStreak(perDay).current)
        // Consistency and the trend still see the future zeros (web parity, §H.16).
        assertEquals(MomentumAnalytics.consistency(perDay), model.consistency)
        assertEquals(MomentumAnalytics.bucketTrend(model.buckets), model.trend)
        assertEquals(TrendKind.Down, model.trend.direction)
        assertTrue(model.showMomentum)
        assertEquals(7, assertNotNull(model.rolling).size)
    }

    @Test
    fun `day granularity carries the rolling average, the totals per context and the busiest day`() {
        val monday = LocalDate.of(2026, 9, 28)
        val spans = listOf(
            span("w1", at(monday, 9), at(monday, 12), category = annaWork.id),
            span("h1", at(monday.plusDays(1), 18), at(monday.plusDays(1), 22), category = sharedHome.id),
            span("w2", at(monday.plusDays(2), 9), at(monday.plusDays(2), 11), category = annaWork.id),
            span("n1", at(monday.plusDays(3), 8), at(monday.plusDays(3), 9)),
            // The partner's solo block is not the viewer's time.
            span("p1", at(monday, 9), at(monday, 17), owner = BORIS),
        )
        val model = buildTrendsModel(inputs(spans = spans, state = PeriodState(preset = PeriodPreset.ThisWeek)))

        assertEquals(10 * HOUR, model.totalMs)
        assertEquals(at(monday.plusDays(1), 0), model.busiest?.start)
        assertEquals(listOf(annaWork.id, sharedHome.id, SeriesKeys.UNCATEGORIZED), model.byContext.seriesKeys)
        assertEquals(
            mapOf(annaWork.id to 5 * HOUR, sharedHome.id to 4 * HOUR, SeriesKeys.UNCATEGORIZED to HOUR),
            model.categoryTotals,
        )
        assertEquals(annaWork.id, model.topCategoryKey)
        val rolling = assertNotNull(model.rolling)
        assertEquals(model.buckets.map { it.start }, rolling.map { it.dayMs })
        // Day two averages its two days: (3h + 4h) / 2.
        assertEquals(3.5 * HOUR, rolling[1].avgMs)
    }

    private companion object {
        const val HOUR = 3_600_000L
        const val DAY = 24 * HOUR

        /** [hour]:00 in Berlin on [date]. */
        fun at(date: LocalDate, hour: Int): Long = date.atTime(hour, 0).atZone(BERLIN).toInstant().toEpochMilli()
    }
}
