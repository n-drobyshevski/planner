package page.planr.android.core.insights

import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.analytics.TaskAnalytics
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.tasks
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.fixtures.Fixtures.zone
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.MsWindow

/** Golden parity of [TaskAnalytics] with lib/analytics/task-stats.ts. */
class TaskStatsFixturesTest {

    @TestFactory
    fun computeTaskStats(): List<DynamicTest> = Fixtures.section("task-stats", "computeTaskStats") { input ->
        Fixtures.json(
            TaskAnalytics.computeTaskStats(input.tasks("tasks"), input.window("window"), input.long("now"), input.zone("zone")),
        )
    }

    @TestFactory
    fun taskVelocity(): List<DynamicTest> = Fixtures.section("task-stats", "taskVelocity") { input ->
        val buckets = input.getValue("buckets").jsonArray.map { Fixtures.window(it.jsonObject) }
        Fixtures.array(TaskAnalytics.taskVelocity(input.tasks("tasks"), buckets).map { Fixtures.json(it) })
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("task-stats", setOf("computeTaskStats", "taskVelocity"))

    @Test
    fun daysAreJudgedInTheViewerZoneNotTheDevice() {
        // 23:30 in Kolkata is already the next day in the test JVM's default zone
        // (Pacific/Chatham, +12:45), so a device-zone leak changes both numbers.
        val kolkata = ZoneId.of("Asia/Kolkata")
        val at = { date: String, minutes: Long ->
            LocalDate.parse(date).atStartOfDay(kolkata).toInstant().toEpochMilli() + minutes * 60_000L
        }
        val stats = TaskAnalytics.computeTaskStats(
            listOf(
                task("due-mon-open", due = "2026-06-01"),
                task("due-tue-open", due = "2026-06-02"),
                task("due-mon-done-2330", due = "2026-06-01", completedAt = at("2026-06-01", 23 * 60 + 30)),
            ),
            MsWindow(at("2026-06-01", 0), at("2026-06-08", 0)),
            at("2026-06-02", 23 * 60 + 30),
            kolkata,
        )
        assertEquals(1, stats.overdueOpenCount) // Monday's only; Tuesday is still today
        assertEquals(3, stats.dueCount)
        assertEquals(1.0 / 3, stats.adherenceRate) // done on its due day
    }

    private fun task(id: String, due: String, completedAt: Long? = null) = InsightTask(
        id = id,
        title = id,
        parentId = null,
        collectionId = null,
        ownerId = "me",
        assigneeId = null,
        createdAt = 0,
        completedAt = completedAt,
        dueDate = LocalDate.parse(due),
    )
}
