package page.planr.android.feature.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import page.planr.android.feature.tasks.detail.TaskDeleted
import page.planr.android.feature.tasks.detail.TaskDeletions

/** The hand-off of a detail's "Task deleted · Undo" to the screen underneath. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskDeletionsTest {
    private class MovableClock(var now: Instant = NOW) : Clock {
        override fun now(): Instant = now
    }

    @Test
    fun `a fresh delete is claimed once`() = runTest {
        val clock = MovableClock()
        val deletions = TaskDeletions(clock)
        deletions.post(TaskDeleted("a") {})
        clock.now = NOW + 29.seconds

        val claimed = mutableListOf<TaskDeleted>()
        backgroundScope.launch { deletions.claims().toList(claimed) }
        runCurrent()

        assertEquals(listOf("a"), claimed.map { it.taskId })
        assertNull(deletions.pending.value)
    }

    @Test
    fun `an unclaimed delete expires instead of surfacing later`() = runTest {
        val clock = MovableClock()
        val deletions = TaskDeletions(clock)
        deletions.post(TaskDeleted("a") {})
        clock.now = NOW + TaskDeletions.EXPIRY + 1.seconds

        val claimed = mutableListOf<TaskDeleted>()
        backgroundScope.launch { deletions.claims().toList(claimed) }
        runCurrent()

        assertTrue(claimed.isEmpty())
        assertNull(deletions.pending.value, "dropped")
    }

    @Test
    fun `a newer delete restarts the wait`() = runTest {
        val clock = MovableClock()
        val deletions = TaskDeletions(clock)
        deletions.post(TaskDeleted("a") {})
        clock.now = NOW + 40.seconds
        deletions.post(TaskDeleted("b") {})
        clock.now = NOW + 50.seconds

        val claimed = mutableListOf<TaskDeleted>()
        backgroundScope.launch { deletions.claims().toList(claimed) }
        runCurrent()

        assertEquals(listOf("b"), claimed.map { it.taskId })
    }
}
