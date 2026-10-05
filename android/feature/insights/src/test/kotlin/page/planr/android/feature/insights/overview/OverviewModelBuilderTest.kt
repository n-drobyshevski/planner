package page.planr.android.feature.insights.overview

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.Delta
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.ShareRow
import page.planr.android.core.insights.model.ShareRowId
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.TotalTrend
import page.planr.android.feature.insights.BERLIN
import page.planr.android.feature.insights.BORIS
import page.planr.android.feature.insights.annaWork
import page.planr.android.feature.insights.inputs
import page.planr.android.feature.insights.model.OverviewLead
import page.planr.android.feature.insights.model.OverviewStat
import page.planr.android.feature.insights.sharedHome
import page.planr.android.feature.insights.span
import page.planr.android.feature.insights.task

/**
 * [buildOverviewModel] over [inputs] (Anna in Berlin, now = Sunday 2026-10-04,
 * so this week is Mon 28 Sep – Sun 4 Oct). The selectors' own rules (top-6
 * folding, shift thresholds, typical-day zeros) are fixture-replayed in
 * OverviewSelectorsTest.
 */
class OverviewModelBuilderTest {

    @Test
    fun `an empty period has no lede, zero days and no shares`() {
        val model = buildOverviewModel(inputs())

        assertEquals(0L, model.totalMs)
        assertNull(model.lede)
        assertEquals(OverviewLead(0, 0.0, 0, 7), model.lead)
        assertEquals(7, model.perDay.size)
        assertTrue(model.perDay.all { it.ms == 0L && it.avgMs == 0.0 && it.prevMs == 0L })
        assertEquals(0.0, model.typicalDayMs)
        assertEquals(TotalChange(TotalTrend.None, 0), model.totalChange)
        assertEquals(emptyList(), model.shares)
        assertEquals(emptyList(), model.shifts)
        assertNull(model.busiestDay)
        assertEquals(
            listOf(
                OverviewStat.Events(0, Delta(0.0, null)),
                OverviewStat.AvgSession(null),
                OverviewStat.BusiestDay(null),
                OverviewStat.TasksDone(0, Delta(0.0, null)),
                OverviewStat.OnTime(null, 0),
                OverviewStat.Overdue(0),
            ),
            model.stats,
        )
    }

    @Test
    fun `stats come in the registry order with their deltas`() {
        val spans = listOf(
            span("mon", at("2026-09-28", 9), at("2026-09-28", 10)),
            span("thu", at("2026-10-01", 10), at("2026-10-01", 13)),
        )
        val prevSpans = listOf(span("prev", at("2026-09-22", 9), at("2026-09-22", 11)))
        val tasks = listOf(
            // Done this week, on its due day.
            task("a", createdAt = at("2026-09-28", 9), completedAt = at("2026-10-01", 18), due = LocalDate.parse("2026-10-01")),
            // Done last week.
            task("b", createdAt = at("2026-09-20", 9), completedAt = at("2026-09-23", 9)),
            task("c", createdAt = at("2026-09-20", 9), completedAt = at("2026-09-24", 9)),
            // Open and past its due day this week: overdue.
            task("d", due = LocalDate.parse("2026-09-30")),
            // Not the viewer's: dropped by the slice.
            task("e", owner = BORIS, completedAt = at("2026-10-02", 9)),
        )
        val model = buildOverviewModel(inputs(spans, prevSpans, tasks))

        assertEquals(4 * HOUR, model.totalMs)
        assertEquals(
            listOf(
                OverviewStat.Events(2, Delta(1.0, 1.0)),
                OverviewStat.AvgSession(2.0 * HOUR),
                OverviewStat.BusiestDay(DayUsage(at("2026-10-01", 0), 3 * HOUR)),
                OverviewStat.TasksDone(1, Delta(-1.0, -0.5)),
                OverviewStat.OnTime(0.5, 2),
                OverviewStat.Overdue(1),
            ),
            model.stats,
        )
        assertEquals(OverviewLead(4 * HOUR, 4.0 * HOUR / 7, 2, 7), model.lead)
        assertEquals(DayUsage(at("2026-10-01", 0), 3 * HOUR), model.busiestDay)
        assertEquals(TotalChange(TotalTrend.Up, 100), model.totalChange)
        // Median of the nonzero days of both weeks: 1h, 3h, 2h → 2h.
        assertEquals(2.0 * HOUR, model.typicalDayMs)
    }

    @Test
    fun `the ghost aligns by day index and ends where a shorter previous month ends`() {
        // October (31 days) after September (30): only the last day has no previous day.
        val october = buildOverviewModel(
            inputs(
                spans = listOf(span("cur", at("2026-10-31", 9), at("2026-10-31", 10))),
                prevSpans = listOf(span("prev", at("2026-09-30", 9), at("2026-09-30", 11))),
                state = PeriodState(PeriodPreset.ThisMonth),
            ),
        )
        assertEquals(31, october.perDay.size)
        assertEquals(2 * HOUR, october.perDay[29].prevMs)
        assertNull(october.perDay[30].prevMs)
        assertEquals(30, october.perDay.count { it.prevMs != null })

        // March after February (28 days): the last three days have none.
        val march = buildOverviewModel(inputs(state = PeriodState(PeriodPreset.ThisMonth), now = at("2026-03-15", 12)))
        assertEquals(31, march.perDay.size)
        assertEquals(listOf(28, 29, 30), march.perDay.indices.filter { march.perDay[it].prevMs == null })

        // November after October (longer): every day has a previous day, the extra one is unused.
        val november = buildOverviewModel(inputs(state = PeriodState(PeriodPreset.ThisMonth), now = at("2026-11-15", 12)))
        assertEquals(30, november.perDay.size)
        assertTrue(november.perDay.all { it.prevMs != null })
    }

    @Test
    fun `inactive blocks count exactly when the filter lets them through`() {
        val sleep = listOf(span("sleep", at("2026-09-29", 1), at("2026-09-29", 7), inactive = true))

        assertEquals(0L, buildOverviewModel(inputs(sleep, includeInactive = false)).totalMs)
        val included = buildOverviewModel(inputs(sleep, includeInactive = true))
        assertEquals(6 * HOUR, included.totalMs)
        assertEquals(OverviewStat.Events(1, Delta(1.0, null)), included.stats[0])
    }

    @Test
    fun `the lede compares with the previous week and names the top context`() {
        val spans = listOf(
            span("work", at("2026-09-29", 9), at("2026-09-29", 12), category = annaWork.id),
            span("home", at("2026-09-30", 18), at("2026-09-30", 19), category = sharedHome.id),
        )
        val prevSpans = listOf(span("prev", at("2026-09-22", 9), at("2026-09-22", 11), category = sharedHome.id))
        val model = buildOverviewModel(inputs(spans, prevSpans))

        val lede = assertNotNull(model.lede)
        assertEquals("lede.overviewHeadline", lede.headline.key)
        assertEquals(LedeArg.Select("up"), lede.headline.args["direction"])
        assertEquals(LedeArg.Select("week"), lede.headline.args["unit"])
        assertEquals(LedeArg.Num(100), lede.headline.args["pct"])
        val support = assertNotNull(lede.support)
        assertEquals(LedeArg.Category(annaWork.id), support.args["name"])
        assertEquals(LedeArg.Num(75), support.args["pct"])

        assertEquals(
            listOf(ShareRow(ShareRowId.Series(annaWork.id), 3 * HOUR), ShareRow(ShareRowId.Series(sharedHome.id), HOUR)),
            model.shares,
        )
        // Work went from nothing to 75%; Home from 100% to 25%.
        assertEquals(
            listOf(
                CategoryShare(annaWork.id, 3 * HOUR, 0.75, 0, 0.0, 0.75),
                CategoryShare(sharedHome.id, HOUR, 0.25, 2 * HOUR, 1.0, -0.75),
            ),
            model.shifts,
        )
    }

    @Test
    fun `no shifts without time in the previous period`() {
        val spans = listOf(span("work", at("2026-09-29", 9), at("2026-09-29", 12), category = annaWork.id))
        val model = buildOverviewModel(inputs(spans))

        assertEquals(TotalChange(TotalTrend.None, 0), model.totalChange)
        assertEquals(LedeArg.Select("none"), model.lede!!.headline.args["direction"])
        assertEquals(emptyList(), model.shifts)
    }

    private companion object {
        const val HOUR = 3_600_000L

        /** [date] at [hour]:00 in Berlin, as epoch ms. */
        fun at(date: String, hour: Int): Long =
            LocalDate.parse(date).atTime(hour, 0).atZone(BERLIN).toInstant().toEpochMilli()
    }
}
