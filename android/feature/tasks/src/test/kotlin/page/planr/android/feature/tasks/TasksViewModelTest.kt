package page.planr.android.feature.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.feature.tasks.detail.TaskDeleted
import page.planr.android.feature.tasks.detail.TaskDeletions
import page.planr.android.feature.tasks.list.TasksNotice
import page.planr.android.feature.tasks.list.TasksViewModel
import page.planr.android.feature.tasks.model.TaskGroupKey
import page.planr.android.feature.tasks.model.TaskScope
import page.planr.android.feature.tasks.model.TaskStateFilter

class TasksViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun TasksViewModel.ids() = state.value.groups.flatMap { g -> g.items.map { it.task.id } }

    @Test
    fun `renders grouped rows and quietly refreshes on open`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("a", collection = COL, due = TODAY), task("b", collection = COL)))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        val state = vm.state.value
        assertEquals(false, state.loading)
        assertEquals(listOf(TaskGroupKey.ThisWeek, TaskGroupKey.NoDate), state.groups.map { it.key })
        assertEquals("Boris", state.partnerName)
        assertEquals(1, data.refreshCount)
        assertEquals(false, state.refreshing)
        assertEquals(null, state.notice, "the opening refresh never reports")
    }

    @Test
    fun `filters narrow the list and clear back to the defaults`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("mine", collection = COL), task("partner", collection = COL, owner = BORIS), task("done", collection = COL, done = true)))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        vm.setScope(TaskScope.Partner)
        assertEquals(listOf("partner"), vm.ids())
        vm.setScope(TaskScope.All)
        vm.setStateFilter(TaskStateFilter.Done)
        assertEquals(listOf("done"), vm.ids())
        vm.clearFilters()
        assertEquals(setOf("mine", "partner"), vm.ids().toSet())
    }

    @Test
    fun `the checkbox completes through setDone and offers undo`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("a", collection = COL)))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        vm.toggleDone("a")

        assertEquals(listOf("a" to true), data.setDoneCalls)
        val notice = vm.state.value.notice
        assertEquals(TasksNotice.Toggled("a", done = true), notice)
        assertEquals(emptyList(), vm.ids(), "a completed task leaves the Open list")

        vm.undo(notice as TasksNotice.Toggled)
        assertEquals(listOf("a" to true, "a" to false), data.setDoneCalls)
        assertEquals(listOf("a"), vm.ids())
    }

    @Test
    fun `a done task reopens`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("a", collection = COL, done = true)))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        vm.toggleDone("a")

        assertEquals(listOf("a" to false), data.setDoneCalls)
        assertEquals(TasksNotice.Toggled("a", done = false), vm.state.value.notice)
    }

    @Test
    fun `only the owner can complete`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("theirs", collection = COL, owner = BORIS, assignee = ANNA)))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        vm.toggleDone("theirs")

        assertTrue(data.setDoneCalls.isEmpty())
    }

    @Test
    fun `a task with no board to move to can't be checked off`() = runTest {
        // No collection (e.g. created over MCP): the DB trigger would undo a bare completed_at.
        val data = FakeTasksDataSource(tasks = listOf(task("loose")))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        assertFalse(vm.state.value.groups.single().items.single().canToggleDone)
        vm.toggleDone("loose")
        assertTrue(data.setDoneCalls.isEmpty())
    }

    @Test
    fun `a consumed notice is not shown again`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("a", collection = COL), task("b", collection = COL)))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        vm.toggleDone("a")
        val first = vm.state.value.notice!!
        vm.toggleDone("b")
        vm.dismissNotice(first) // the screen finishing with the older notice keeps the newer one
        assertEquals(TasksNotice.Toggled("b", done = true), vm.state.value.notice)
        vm.dismissNotice(vm.state.value.notice!!)
        assertEquals(null, vm.state.value.notice)
    }

    @Test
    fun `a write in flight shows checked and blocks a second toggle`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val data = FakeTasksDataSource(tasks = listOf(task("a", collection = COL))).apply { setDoneGate = gate }
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        vm.toggleDone("a")
        val pending = vm.state.value
        assertEquals(setOf("a"), pending.pendingIds)
        assertTrue(pending.groups.single().items.single().done)
        vm.toggleDone("a")

        gate.complete(Unit)
        assertEquals(listOf("a" to true), data.setDoneCalls)
        assertEquals(emptySet(), vm.state.value.pendingIds)
    }

    @Test
    fun `stale and failed writes surface as notices`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("a", collection = COL), task("b", collection = COL)))
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        data.failWith = StaleWriteException("tasks", "a")
        vm.toggleDone("a")
        assertEquals(TasksNotice.Stale, vm.state.value.notice)

        data.failWith = IllegalStateException("offline")
        vm.toggleDone("b")
        assertEquals(TasksNotice.Failed, vm.state.value.notice)
        assertEquals(emptySet(), vm.state.value.pendingIds)

        vm.dismissNotice()
        assertEquals(null, vm.state.value.notice)
    }

    @Test
    fun `pull to refresh reports a failure`() = runTest {
        val data = FakeTasksDataSource()
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, TaskDeletions(FixedClock))
        keepCollecting(vm.state)

        data.failWith = IllegalStateException("offline")
        vm.refresh()

        assertEquals(2, data.refreshCount)
        assertEquals(TasksNotice.Failed, vm.state.value.notice)
        assertEquals(false, vm.state.value.refreshing)
    }

    @Test
    fun `undo of a delete made in the detail restores the task, and a failed one says so`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("a")))
        val deletions = TaskDeletions(FixedClock)
        val vm = TasksViewModel(data, FixedClock, main.dispatcher, deletions)
        keepCollecting(vm.state)
        val snapshot = data.deleteTask("a")
        val deleted = TaskDeleted("a") { data.restoreTask(snapshot) }
        assertEquals(emptyList(), vm.ids())

        vm.undoDelete(deleted)
        assertEquals(listOf("a"), vm.ids())

        data.failWith = IllegalStateException("offline")
        vm.undoDelete(deleted)
        assertEquals(TasksNotice.Failed, vm.state.value.notice)
    }
}
