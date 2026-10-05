package page.planr.android.feature.insights.tasks

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LeadTime
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeTone
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.feature.insights.ANNA
import page.planr.android.feature.insights.BERLIN
import page.planr.android.feature.insights.BORIS
import page.planr.android.feature.insights.NOW_MS
import page.planr.android.feature.insights.inputs
import page.planr.android.feature.insights.task

class TasksModelBuilderTest {

    @Test
    fun `only subtasks is the empty state`() {
        val tasks = listOf(
            task("sub-open", parent = "gone", due = LocalDate.of(2026, 9, 1)),
            task("sub-done", parent = "gone", createdAt = MONDAY, completedAt = MONDAY + HOUR),
        )
        val model = buildTasksModel(inputs(tasks = tasks))

        assertFalse(model.hasTopLevel)
        // Subtasks count toward nothing, so the numbers are all zero and the lede neutral.
        assertEquals(0, model.stats.completedCount)
        assertEquals(0, model.stats.overdueOpenCount)
        assertNull(model.leadTime)
        assertEquals(LedeTone.Neutral, model.lede.tone)
        assertTrue(model.velocity.all { it.created == 0 && it.completed == 0 })
    }

    @Test
    fun `a partner's own tasks are not the viewer's`() {
        val model = buildTasksModel(inputs(tasks = listOf(task("theirs", owner = BORIS))))
        assertFalse(model.hasTopLevel)

        val assigned = buildTasksModel(inputs(tasks = listOf(task("assigned", owner = BORIS, assignee = ANNA))))
        assertTrue(assigned.hasTopLevel)
    }

    @Test
    fun `an open task past its due day makes the lede an attention line`() {
        val tasks = listOf(
            task("late", createdAt = MONDAY - 3 * DAY, due = LocalDate.of(2026, 10, 1)),
            task("done", createdAt = MONDAY, completedAt = MONDAY + 5 * HOUR),
            // Due today (Sunday 4 Oct in Berlin) is not overdue yet.
            task("today", createdAt = MONDAY, due = LocalDate.of(2026, 10, 4)),
        )
        val model = buildTasksModel(inputs(tasks = tasks))

        assertTrue(model.hasTopLevel)
        assertEquals(1, model.stats.overdueOpenCount)
        assertEquals(LedeTone.Attention, model.lede.tone)
        assertEquals("lede.tasksOverdueHeadline", model.lede.headline.key)
        assertEquals(LedeArg.Num(1), model.lede.headline.args["count"])
        assertEquals("lede.tasksDoneSupport", model.lede.support?.key)
        assertEquals(LedeArg.Num(1), model.lede.support?.args?.get("count"))
    }

    @Test
    fun `without overdue tasks the lede compares with the previous week`() {
        val tasks = listOf(
            task("prev", createdAt = MONDAY - 6 * DAY, completedAt = MONDAY - 5 * DAY),
            task("a", createdAt = MONDAY, completedAt = MONDAY + DAY),
            task("b", createdAt = MONDAY, completedAt = MONDAY + 2 * DAY, due = LocalDate.of(2026, 10, 2)),
            task("c", createdAt = MONDAY, completedAt = MONDAY + 3 * DAY),
        )
        val model = buildTasksModel(inputs(tasks = tasks))

        assertEquals(LedeTone.Neutral, model.lede.tone)
        assertEquals("lede.tasksDoneHeadline", model.lede.headline.key)
        assertEquals(LedeArg.Select("more"), model.lede.headline.args["direction"])
        assertEquals(LedeArg.Num(2), model.lede.headline.args["diff"])
        assertEquals(LedeArg.Select("week"), model.lede.headline.args["unit"])
        assertEquals(1, model.prevStats.completedCount)
        assertEquals("lede.tasksAdherenceSupport", model.lede.support?.key)
        assertEquals(LedeArg.Num(100), model.lede.support?.args?.get("pct"))
    }

    @Test
    fun `velocity buckets are half-open local days`() {
        val window = inputs().period.window
        val tasks = listOf(
            task("at-start", createdAt = window.start),
            task("last-ms", createdAt = window.end - 1, completedAt = window.end - 1),
            task("at-end", createdAt = window.end),
            task("before", createdAt = window.start - 1, completedAt = MONDAY + DAY),
            // Monday 23:30 in Berlin, still Monday's bucket; Tuesday 00:00 opens the next.
            task("late-monday", createdAt = MONDAY + 23 * HOUR + 30 * MINUTE, completedAt = MONDAY + DAY),
        )
        val model = buildTasksModel(inputs(tasks = tasks))

        assertEquals(Granularity.Day, model.granularity)
        assertEquals(7, model.velocity.size)
        assertEquals(window.start, model.velocity.first().start)
        assertEquals(window.end, model.velocity.last().end)
        assertEquals(listOf(2, 0, 0, 0, 0, 0, 1), model.velocity.map { it.created })
        assertEquals(listOf(0, 2, 0, 0, 0, 0, 1), model.velocity.map { it.completed })
        assertEquals(3, model.stats.createdCount)
    }

    @Test
    fun `week granularity gives one velocity point per week bucket`() {
        val state = PeriodState(preset = PeriodPreset.Last90d, granularity = Granularity.Week)
        val model = buildTasksModel(inputs(tasks = listOf(task("a", createdAt = MONDAY)), state = state))

        assertEquals(Granularity.Week, model.granularity)
        assertEquals(model.velocity.size, inputs(state = state).period.buckets.size)
        assertEquals(1, model.velocity.sumOf { it.created })
    }

    @Test
    fun `the median lead time becomes days and hours past two days`() {
        val short = buildTasksModel(inputs(tasks = listOf(task("a", createdAt = MONDAY, completedAt = MONDAY + 5 * HOUR))))
        assertEquals(LeadTime.Short(5.0 * HOUR), short.leadTime)

        val long = buildTasksModel(
            inputs(tasks = listOf(task("b", createdAt = MONDAY - 3 * DAY, completedAt = MONDAY + 4 * HOUR))),
        )
        assertEquals(LeadTime.DaysHours(days = 3, hours = 4), long.leadTime)
    }

    private companion object {
        const val MINUTE = 60_000L
        const val HOUR = 3_600_000L
        const val DAY = 24 * HOUR

        /** Monday 2026-09-28 00:00 in Berlin: the start of the default this-week window at NOW. */
        val MONDAY: Long = LocalDate.of(2026, 9, 28).atStartOfDay(BERLIN).toInstant().toEpochMilli()

        init {
            check(MONDAY < NOW_MS)
        }
    }
}
