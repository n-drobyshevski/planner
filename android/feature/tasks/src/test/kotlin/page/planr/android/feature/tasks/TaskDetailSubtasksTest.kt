package page.planr.android.feature.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.feature.tasks.detail.DeletePlan
import page.planr.android.feature.tasks.detail.TaskDeleted
import page.planr.android.feature.tasks.detail.TaskDeletions
import page.planr.android.feature.tasks.detail.TaskDetailNotice
import page.planr.android.feature.tasks.detail.TaskDetailViewModel
import page.planr.android.feature.tasks.detail.deletePlan
import page.planr.android.feature.tasks.model.depthOf

/** The detail's subtasks (complete, add) and delete. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskDetailSubtasksTest {
    @get:Rule val main = MainDispatcherRule()

    private val parent = task("t1", collection = COL, board = "todo", category = annaWork.id, assignee = BORIS)
    private val deletions = TaskDeletions(FixedClock)

    private fun subject(data: FakeTasksDataSource, id: String = "t1") = TaskDetailViewModel(id, data, FixedClock, deletions)


    @Test
    fun `a subtask's checkbox completes and reopens it through setDone`() = runTest {
        val data = FakeTasksDataSource(
            tasks = listOf(parent, task("s1", parent = "t1", collection = COL), task("s2", parent = "t1", collection = COL, done = true)),
        )
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.toggleSubtask("s1")
        vm.toggleSubtask("s2")

        assertEquals(listOf("s1" to true, "s2" to false), data.setDoneCalls)
        val items = vm.state.value.subtasks.associateBy { it.task.id }
        assertTrue(items.getValue("s1").done)
        assertFalse(items.getValue("s2").done)
    }

    @Test
    fun `a write in flight shows the new state and disables the checkbox`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("s1", parent = "t1", collection = COL)))
        val vm = subject(data)
        keepCollecting(vm.state)
        val gate = CompletableDeferred<Unit>()
        data.setDoneGate = gate

        vm.toggleSubtask("s1")
        val item = vm.state.value.subtasks.single()
        assertTrue(item.done)
        assertTrue(item.pending)
        vm.toggleSubtask("s1")
        assertEquals(1, data.setDoneCalls.size, "a second tap while pending is ignored")

        gate.complete(Unit)
        assertFalse(vm.state.value.subtasks.single().pending)
    }

    @Test
    fun `under a sequential parent only the next open subtask can be completed`() = runTest {
        val data = FakeTasksDataSource(
            tasks = listOf(
                parent.copy(sequential = true),
                task("s3", parent = "t1", collection = COL, position = 3.0),
                task("s1", parent = "t1", collection = COL, position = 1.0, done = true),
                task("s2", parent = "t1", collection = COL, position = 2.0),
            ),
        )
        val vm = subject(data)
        keepCollecting(vm.state)

        val items = vm.state.value.subtasks
        assertEquals(listOf("s1", "s2", "s3"), items.map { it.task.id })
        assertEquals(listOf(false, false, true), items.map { it.blocked })
        assertEquals(listOf(true, true, false), items.map { it.canToggle }, "done ones can still be reopened")

        vm.toggleSubtask("s3")
        assertTrue(data.setDoneCalls.isEmpty())

        vm.toggleSubtask("s2")
        assertEquals(listOf("s2" to true), data.setDoneCalls)
        assertEquals(listOf(false, false, false), vm.state.value.subtasks.map { it.blocked }, "s3 is next now")
    }

    @Test
    fun `without sequential order any subtask can be completed`() = runTest {
        val data = FakeTasksDataSource(
            tasks = listOf(parent, task("s1", parent = "t1", collection = COL), task("s2", parent = "t1", collection = COL, position = 1.0)),
        )
        val vm = subject(data)
        keepCollecting(vm.state)

        assertTrue(vm.state.value.subtasks.all { it.canToggle && !it.blocked })
    }

    @Test
    fun `the partner's subtask and one without a board can't be toggled`() = runTest {
        val data = FakeTasksDataSource(
            tasks = listOf(parent, task("p", parent = "t1", owner = BORIS, collection = COL), task("loose", parent = "t1")),
        )
        val vm = subject(data)
        keepCollecting(vm.state)

        assertTrue(vm.state.value.subtasks.none { it.canToggle })
        vm.toggleSubtask("p")
        vm.toggleSubtask("loose")
        assertTrue(data.setDoneCalls.isEmpty())
    }

    @Test
    fun `a failed subtask write says so and settles`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("s1", parent = "t1", collection = COL)))
        val vm = subject(data)
        keepCollecting(vm.state)

        data.failWith = StaleWriteException("tasks", "s1")
        vm.toggleSubtask("s1")

        assertEquals(TaskDetailNotice.Stale, vm.state.value.notice)
        val item = vm.state.value.subtasks.single()
        assertFalse(item.done)
        assertFalse(item.pending)
    }

    @Test
    fun `adding a subtask files it like the parent and clears the field`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent.copy(isPrivate = false)))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.setSubtaskTitle("  Pack bags ")
        vm.addSubtask()

        val draft = data.created.single()
        assertEquals("Pack bags", draft.title)
        assertEquals("t1", draft.parentId)
        assertEquals(WS, draft.workspaceId)
        assertEquals(ANNA, draft.ownerId)
        assertEquals(COL, draft.collectionId)
        assertEquals("todo", draft.boardId)
        assertEquals(annaWork.id, draft.categoryId)
        assertEquals(BORIS, draft.assigneeId)
        assertFalse(draft.isPrivate)
        assertEquals(NOW.toEpochMilliseconds().toDouble(), draft.position)
        assertEquals("", vm.state.value.subtaskTitle)
        assertEquals(listOf("Pack bags"), vm.state.value.subtasks.map { it.task.title })
    }

    @Test
    fun `under a done parent a new subtask starts in the first open column`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent.copy(boardId = "done", completedAt = NOW)))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.setSubtaskTitle("One more thing")
        vm.addSubtask()

        assertEquals("todo", data.created.single().boardId)
    }

    @Test
    fun `a blank subtask, or one on the partner's task, isn't created`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("b", owner = BORIS)))
        val mine = subject(data)
        keepCollecting(mine.state)
        mine.setSubtaskTitle("   ")
        mine.addSubtask()

        val theirs = subject(data, id = "b")
        keepCollecting(theirs.state)
        theirs.setSubtaskTitle("Sneaky")
        theirs.addSubtask()

        assertTrue(data.created.isEmpty())
    }

    @Test
    fun `the deepest level offers no subtask field, and an add there isn't sent`() = runTest {
        val data = FakeTasksDataSource(
            tasks = listOf(parent, task("d1", parent = "t1"), task("d2", parent = "d1"), task("d3", parent = "d2")),
        )
        val third = subject(data, id = "d2")
        keepCollecting(third.state)
        assertTrue(third.state.value.canAddSubtask, "depth 2 may still have children")

        val deepest = subject(data, id = "d3")
        keepCollecting(deepest.state)
        assertTrue(deepest.state.value.canEdit)
        assertFalse(deepest.state.value.canAddSubtask)
        deepest.setSubtaskTitle("Too deep")
        assertFalse(deepest.state.value.hasDraft, "the field isn't shown, so nothing is lost")
        deepest.addSubtask()

        assertTrue(data.created.isEmpty())
    }

    @Test
    fun `depth counts ancestors, as lib-tasks-tree depthOf`() {
        val tasks = listOf(task("r"), task("a", parent = "r"), task("b", parent = "a"), task("orphan", parent = "gone"))
        val byId = tasks.associateBy { it.id }
        assertEquals(listOf(0, 1, 2, 0), tasks.map { depthOf(it, byId) })

        val cycle = listOf(task("x", parent = "y"), task("y", parent = "x"))
        assertEquals(2, depthOf(cycle[0], cycle.associateBy { it.id }), "a cycle ends the walk")
    }

    @Test
    fun `a failed add keeps the title`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)
        data.failWith = IllegalStateException("offline")

        vm.setSubtaskTitle("Pack bags")
        vm.addSubtask()

        assertEquals("Pack bags", vm.state.value.subtaskTitle)
        assertFalse(vm.state.value.addingSubtask)
        assertEquals(TaskDetailNotice.Failed, vm.state.value.notice)
    }

    @Test
    fun `a subtask add in flight holds Back and Save until it lands`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)
        val gate = CompletableDeferred<Unit>()
        data.createGate = gate

        vm.setTitle("Renamed")
        vm.setSubtaskTitle("Pack bags")
        vm.addSubtask()

        // The screen holds Back on this: a pop now would cancel the create half-way.
        assertTrue(vm.state.value.subtaskWriting)
        assertTrue(vm.state.value.holdsBack)
        vm.save()
        assertTrue(data.updates.isEmpty(), "the save would close the screen and cancel the add")
        assertFalse(vm.state.value.saved)

        gate.complete(Unit)
        assertFalse(vm.state.value.holdsBack)
        vm.save()
        assertEquals(1, data.updates.size)
        assertTrue(vm.state.value.saved)
    }

    @Test
    fun `a subtask check-off in flight holds Back and Save`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("s1", parent = "t1", collection = COL)))
        val vm = subject(data)
        keepCollecting(vm.state)
        val gate = CompletableDeferred<Unit>()
        data.setDoneGate = gate

        vm.setTitle("Renamed")
        vm.toggleSubtask("s1")
        assertTrue(vm.state.value.holdsBack)
        vm.save()
        assertTrue(data.updates.isEmpty())

        gate.complete(Unit)
        assertFalse(vm.state.value.holdsBack)
    }

    @Test
    fun `an undo in flight holds Back until it lands`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("s1", parent = "t1")))
        val vm = subject(data)
        keepCollecting(vm.state)
        val snapshot = data.deleteTask("s1")
        val gate = CompletableDeferred<Unit>()

        vm.undoDelete(
            TaskDeleted("s1") {
                gate.await()
                data.restoreTask(snapshot)
            },
        )
        assertTrue(vm.state.value.holdsBack)
        vm.delete()
        assertTrue(data.blockChecks.isEmpty(), "the plan would miss the subtask being put back")

        gate.complete(Unit)
        assertFalse(vm.state.value.holdsBack)
        assertEquals(listOf("s1"), vm.state.value.subtasks.map { it.task.id })
    }

    @Test
    fun `a failed undo releases Back too`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.undoDelete(TaskDeleted("s1") { error("offline") })

        assertFalse(vm.state.value.holdsBack)
        assertEquals(TaskDetailNotice.Failed, vm.state.value.notice)
    }

    @Test
    fun `an unsent subtask title is a draft to discard, though the form is clean`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)
        assertFalse(vm.state.value.hasDraft)

        vm.setSubtaskTitle("Pack bags")
        assertFalse(vm.state.value.dirty)
        assertTrue(vm.state.value.hasDraft)

        vm.setSubtaskTitle("   ")
        assertFalse(vm.state.value.hasDraft)
    }

    @Test
    fun `the delete plan asks first whenever something would go with the task`() {
        assertEquals(DeletePlan.Immediate, deletePlan(subtasks = 0, hasBlocks = false))
        assertEquals(DeletePlan.Confirm(2, withBlocks = false), deletePlan(subtasks = 2, hasBlocks = false))
        assertEquals(DeletePlan.Confirm(0, withBlocks = true), deletePlan(subtasks = 0, hasBlocks = true))
    }

    @Test
    fun `a leaf without blocks is deleted at once, and its undo restores it`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.delete()

        assertEquals(listOf("t1"), data.blockChecks.single().toList())
        assertEquals(listOf("t1"), data.deletedIds)
        assertTrue(vm.state.value.deleted)
        assertNull(vm.state.value.task)
        val deleted = assertNotNull(deletions.pending.value)
        assertEquals("t1", deleted.taskId)

        deleted.undo()
        assertEquals(listOf("t1"), data.restoredIds)
        assertEquals(listOf("t1"), data.tasks.value.map { it.id })
    }

    @Test
    fun `a delete in flight holds the screen until it lands`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)
        val gate = CompletableDeferred<Unit>()
        data.deleteGate = gate

        vm.delete()

        // The screen holds Back on `deleting`: a pop now would cancel the write half-way.
        assertTrue(vm.state.value.deleting)
        assertFalse(vm.state.value.deleted)
        vm.delete()
        assertEquals(listOf("t1"), data.deletedIds, "a second tap is ignored")

        gate.complete(Unit)
        assertFalse(vm.state.value.deleting)
        assertTrue(vm.state.value.deleted)
    }

    @Test
    fun `no delete while a subtask is being added, nor an add while deleting`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)
        val createGate = CompletableDeferred<Unit>()
        data.createGate = createGate

        vm.setSubtaskTitle("Pack bags")
        vm.addSubtask()
        assertTrue(vm.state.value.addingSubtask)
        vm.delete()
        assertTrue(data.blockChecks.isEmpty(), "the plan would miss the new subtask")

        createGate.complete(Unit)
        val deleteGate = CompletableDeferred<Unit>()
        data.deleteGate = deleteGate
        data.blockedTaskIds = emptySet()
        vm.delete()
        assertEquals(DeletePlan.Confirm(1, withBlocks = false), vm.state.value.confirmDelete)
        vm.confirmDelete()
        assertTrue(vm.state.value.deleting)
        vm.setSubtaskTitle("One more")
        vm.addSubtask()
        assertEquals(1, data.created.size)
        deleteGate.complete(Unit)
    }

    @Test
    fun `a task with subtasks asks first, naming the whole subtree, and has no undo`() = runTest {
        val data = FakeTasksDataSource(
            tasks = listOf(parent, task("s1", parent = "t1"), task("s2", parent = "t1"), task("s1a", parent = "s1")),
        )
        data.blockedTaskIds = setOf("s1a")
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.delete()

        assertEquals(setOf("t1", "s1", "s2", "s1a"), data.blockChecks.single().toSet())
        assertEquals(DeletePlan.Confirm(3, withBlocks = true), vm.state.value.confirmDelete)
        assertTrue(data.deletedIds.isEmpty())
        assertFalse(vm.state.value.deleting)

        vm.confirmDelete()

        assertEquals(listOf("t1"), data.deletedIds)
        assertTrue(data.tasks.value.isEmpty())
        assertTrue(vm.state.value.deleted)
        assertNull(deletions.pending.value)
    }

    @Test
    fun `a leaf with calendar blocks asks first too, and cancel keeps it`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        data.blockedTaskIds = setOf("t1")
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.delete()
        assertEquals(DeletePlan.Confirm(0, withBlocks = true), vm.state.value.confirmDelete)

        vm.dismissDelete()
        assertNull(vm.state.value.confirmDelete)
        assertTrue(data.deletedIds.isEmpty())
        assertFalse(vm.state.value.deleted)
    }

    @Test
    fun `a failed delete check stays put and says so`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent))
        val vm = subject(data)
        keepCollecting(vm.state)
        data.failWith = IllegalStateException("offline")

        vm.delete()

        assertEquals(TaskDetailNotice.Failed, vm.state.value.notice)
        assertFalse(vm.state.value.deleting)
        assertFalse(vm.state.value.deleted)
        assertTrue(data.deletedIds.isEmpty())
    }

    @Test
    fun `the partner's task can't be deleted`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("t1", owner = BORIS)))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.delete()

        assertTrue(data.blockChecks.isEmpty())
        assertTrue(data.deletedIds.isEmpty())
    }

    @Test
    fun `undo from the parent's detail restores a deleted subtask`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("s1", parent = "t1")))
        val vm = subject(data)
        keepCollecting(vm.state)
        val snapshot = data.deleteTask("s1")
        assertTrue(vm.state.value.subtasks.isEmpty())

        vm.undoDelete(TaskDeleted("s1") { data.restoreTask(snapshot) })

        assertEquals(listOf("s1"), vm.state.value.subtasks.map { it.task.id })
    }

    @Test
    fun `the undo shows once, on the screen underneath, never on the closing detail`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("s1", parent = "t1")))
        val closing = subject(data, id = "s1")
        val underneath = subject(data)
        keepCollecting(closing.state)
        val onClosing = mutableListOf<TaskDeleted>()
        backgroundScope.launch { closing.deletedTasks.toList(onClosing) }

        closing.delete()
        runCurrent()
        assertTrue(onClosing.isEmpty())

        val onParent = mutableListOf<TaskDeleted>()
        backgroundScope.launch { underneath.deletedTasks.toList(onParent) }
        runCurrent()
        assertEquals(listOf("s1"), onParent.map { it.taskId })
        assertNull(deletions.pending.value, "claimed")
    }

    @Test
    fun `an undo cut short by a rotation is shown again by the recreated screen`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(parent, task("s1", parent = "t1")))
        val underneath = subject(data)
        deletions.post(TaskDeleted("s1") {})
        val shown = mutableListOf<TaskDeleted>()
        val before = backgroundScope.launch { underneath.deletedTasks.toList(shown) }
        runCurrent()
        before.cancel()

        underneath.putBackDeleted(shown.single())
        backgroundScope.launch { underneath.deletedTasks.toList(shown) }
        runCurrent()

        assertEquals(listOf("s1", "s1"), shown.map { it.taskId })
        assertNull(deletions.pending.value)
    }
}
