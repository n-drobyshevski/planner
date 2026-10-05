package page.planr.android.feature.insights.patterns

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.Span
import page.planr.android.feature.insights.BERLIN
import page.planr.android.feature.insights.inputs
import page.planr.android.feature.insights.span

/** [buildPatternsModel] over the viewer's week (Mon 2026-09-28 … Sun 2026-10-04, Berlin). */
class PatternsModelBuilderTest {

    @Test
    fun `an empty period has nothing to show`() {
        val model = buildPatternsModel(inputs())

        assertEquals(0L, model.weekdayTotalMs)
        assertNull(model.lede)
        assertEquals(0, model.topWeekday.weekday) // all zero: Monday
        assertFalse(model.hasAttributes)
        assertNull(model.bestDaypart)
        assertNull(model.worstDaypart)
        assertEquals(42, model.bands.size)
        assertTrue(model.bands.all { it == 0L })
        assertEquals(0L, model.sharesTotalMs)
        assertTrue(model.satisfaction.isEmpty())
        assertEquals(0, model.fragmentation.blockCount)
    }

    @Test
    fun `the heaviest weekday leads, with the typical block as support`() {
        val model = buildPatternsModel(
            inputs(spans = listOf(at("mon", day = 0, hour = 9, hours = 1), at("thu", day = 3, hour = 9, hours = 3))),
        )

        assertEquals(4 * HOUR, model.weekdayTotalMs)
        assertEquals(3, model.topWeekday.weekday)
        val lede = assertNotNull(model.lede)
        assertEquals("lede.patternsHeadline", lede.headline.key)
        // No rated daypart: the support falls back to the median block (1 h and 3 h → 2 h).
        assertEquals("lede.patternsSupportBlock", lede.support?.key)
        assertEquals(2.0 * HOUR, model.fragmentation.medianBlockMs)
        assertEquals(Granularity.Day, model.granularity)
    }

    @Test
    fun `the toughest daypart is hidden when it is also the best`() {
        // Five mornings and five evenings, rated alike: best and worst are both Morning.
        val alike = (0 until 5).flatMap { d ->
            listOf(rated("m$d", d, hour = 8, satisfaction = 3), rated("e$d", d, hour = 18, satisfaction = 3))
        }
        val model = buildPatternsModel(inputs(spans = alike))

        assertEquals(Daypart.Morning, model.bestDaypart?.daypart)
        assertNull(model.worstDaypart)
        assertTrue(model.hasAttributes)
        assertEquals("lede.patternsSupportDaypart", model.lede?.support?.key)
    }

    @Test
    fun `a worse-rated daypart is shown as the toughest`() {
        val split = (0 until 5).flatMap { d ->
            listOf(rated("m$d", d, hour = 8, satisfaction = 4), rated("e$d", d, hour = 18, satisfaction = 1))
        }
        val model = buildPatternsModel(inputs(spans = split))

        assertEquals(Daypart.Morning, model.bestDaypart?.daypart)
        assertEquals(Daypart.Evening, model.worstDaypart?.daypart)
    }

    @Test
    fun `the balance half and the weekday rhythm count the same time`() {
        // Edges included: one span starts before the week, one runs past its end.
        val spans = listOf(
            span("before", start = local(-1, 22), end = local(0, 2), category = "cat-work"),
            at("tue", day = 1, hour = 10, hours = 2, category = "cat-home"),
            at("sat", day = 5, hour = 14, hours = 1),
            span("after", start = local(6, 23), end = local(7, 3), category = "cat-work"),
        )
        val model = buildPatternsModel(inputs(spans = spans, prevSpans = listOf(at("prev", day = -3, hour = 9, hours = 2))))

        assertEquals(6 * HOUR, model.weekdayTotalMs)
        assertEquals(model.weekdayTotalMs, model.sharesTotalMs)
        assertEquals(listOf("cat-work", "cat-home", null), model.shares.map { it.categoryId })
        assertEquals(2 * HOUR, model.shares.sumOf { it.prevMs })
    }

    @Test
    fun `the 4-hour bands hold every heatmap millisecond`() {
        val spans = listOf(
            at("night", day = 2, hour = 2, hours = 3), // 02:00–05:00 crosses the 0–4 / 4–8 edge
            at("evening", day = 4, hour = 19, hours = 2),
            span("weekend", start = local(5, 22), end = local(6, 1)),
        )
        val model = buildPatternsModel(inputs(spans = spans))

        assertEquals(model.heatmap.cells.sumOf { it.ms }, model.bands.sum())
        assertEquals(model.weekdayTotalMs, model.bands.sum())
        // Wednesday (2): 2 h in 0–4 and 1 h in 4–8.
        assertEquals(2 * HOUR, model.bands[2 * 6 + 0])
        assertEquals(HOUR, model.bands[2 * 6 + 1])
    }

    @Test
    fun `the context mix follows the effective granularity`() {
        val state = PeriodState(preset = PeriodPreset.Last90d, granularity = Granularity.Week)
        val model = buildPatternsModel(inputs(spans = listOf(at("tue", day = 1, hour = 9, hours = 1)), state = state))

        assertEquals(Granularity.Week, model.granularity)
        assertEquals(model.contextMix.rows.size, inputs(state = state).period.buckets.size)
    }

    // --- Helpers ---------------------------------------------------------------------

    /** Local Berlin time on day [day] of the week (0 = Mon 2026-09-28). */
    private fun local(day: Int, hour: Int): Long =
        MONDAY.plusDays(day.toLong()).atTime(hour, 0).atZone(BERLIN).toInstant().toEpochMilli()

    private fun at(key: String, day: Int, hour: Int, hours: Int, category: String? = null): Span =
        span(key, start = local(day, hour), end = local(day, hour) + hours * HOUR, category = category)

    private fun rated(key: String, day: Int, hour: Int, satisfaction: Int): Span =
        span(key, start = local(day, hour), end = local(day, hour) + HOUR, attributes = Attributes(satisfaction = satisfaction))

    private companion object {
        const val HOUR = 3_600_000L
        val MONDAY: LocalDate = LocalDate.of(2026, 9, 28)
    }
}
