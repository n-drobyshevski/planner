package page.planr.android.feature.insights

import java.time.LocalDate
import java.time.LocalTime
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.TimeSource
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.Focus
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.Span
import page.planr.android.feature.insights.model.DefaultInsightsModelFactory

/**
 * A loose guard against accidental O(n²)/O(n³) builders: the largest window
 * the period picker allows (366 days, custom), 6 000 spans in it and as many in
 * the previous window, 800 tasks, every tab builder at both bucket sizes the
 * window allows. The budget is generous; mark the test `@Ignore` if CI hardware
 * turns out too noisy, but keep it runnable.
 */
class ComputeBudgetTest {

    @Test
    fun `a full year of data builds every tab within the budget`() {
        val today = LocalDate.of(2026, 10, 4)
        val first = today.minusDays(365)
        val noon = { d: LocalDate -> d.atTime(LocalTime.NOON).atZone(BERLIN).toInstant().toEpochMilli() }
        val factory = DefaultInsightsModelFactory()
        val random = Random(20261004)
        val spans = spans(random, "cur", noon(first) - 12 * HOUR, 366)
        val prevSpans = spans(random, "prev", noon(first.minusDays(366)) - 12 * HOUR, 366)
        val tasks = tasks(random, noon(first))

        val mark = TimeSource.Monotonic.markNow()
        for (granularity in listOf(Granularity.Week, Granularity.Month)) {
            val state = PeriodState(PeriodPreset.Custom, noon(first), noon(today), granularity)
            val inputs = inputs(spans, prevSpans, tasks, state, includeInactive = true)
            assertFalse(inputs.period.clamped)
            assertEquals(366, inputs.period.days.size)
            assertEquals(granularity, inputs.period.granularity)

            assertTrue(factory.overview(inputs).totalMs > 0)
            assertTrue(factory.trends(inputs).totalMs > 0)
            assertTrue(factory.patterns(inputs).weekdayTotalMs > 0)
            assertTrue(factory.tasks(inputs).hasTopLevel)
            factory.dayDetail(inputs, inputs.period.days[180], naturalOrder())
        }
        val elapsed = mark.elapsedNow()
        assertTrue(elapsed.inWholeMilliseconds < 3_000, "four builders over a year took $elapsed")
    }

    /** [count] days from [startMs]: ~16 spans a day, mixed owners, categories and attributes. */
    private fun spans(random: Random, prefix: String, startMs: Long, count: Int): List<Span> =
        List(SPANS) { i ->
            val start = startMs + random.nextLong(count * 24 * HOUR / FIVE_MIN) * FIVE_MIN
            val owner = if (random.nextInt(4) == 0) BORIS else ANNA
            span(
                key = "$prefix-$i",
                start = start,
                end = start + (3 + random.nextInt(36)) * FIVE_MIN,
                owner = owner,
                shared = owner == BORIS && random.nextBoolean(),
                category = listOf(sharedHome.id, annaWork.id, null)[random.nextInt(3)],
                inactive = random.nextInt(20) == 0,
                attributes = if (random.nextInt(3) == 0) {
                    Attributes(
                        energy = 1 + random.nextInt(4),
                        focus = if (random.nextBoolean()) Focus.Deep else Focus.Shallow,
                        satisfaction = 1 + random.nextInt(4),
                    )
                } else {
                    Attributes.None
                },
            )
        }

    /** 800 tasks created through the year; a quarter subtasks, most completed, some due. */
    private fun tasks(random: Random, firstMs: Long): List<InsightTask> = List(TASKS) { i ->
        val created = firstMs + random.nextLong(365 * 24 * HOUR)
        val done = random.nextInt(3) != 0
        task(
            id = "t-$i",
            owner = if (random.nextInt(5) == 0) BORIS else ANNA,
            assignee = if (random.nextInt(4) == 0) ANNA else null,
            parent = if (i >= 4 && random.nextInt(4) == 0) "t-${random.nextInt(i)}" else null,
            createdAt = created,
            completedAt = if (done) created + random.nextLong(1, 14 * 24 * HOUR) else null,
            due = if (random.nextBoolean()) {
                java.time.Instant.ofEpochMilli(created).atZone(BERLIN).toLocalDate().plusDays(random.nextLong(10))
            } else {
                null
            },
        )
    }

    private companion object {
        const val SPANS = 6_000
        const val TASKS = 800
        const val HOUR = 3_600_000L
        const val FIVE_MIN = 300_000L
    }
}
