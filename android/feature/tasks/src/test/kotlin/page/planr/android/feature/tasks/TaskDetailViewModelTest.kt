package page.planr.android.feature.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import org.junit.Rule
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.model.TaskPriority
import page.planr.android.core.recurrence.PatchField
import page.planr.android.feature.tasks.detail.TaskDeletions
import page.planr.android.feature.tasks.detail.TaskDetailNotice
import page.planr.android.feature.tasks.detail.TaskDetailViewModel
import page.planr.android.feature.tasks.model.TaskForm

class TaskDetailViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val original = task(
        "t1",
        title = "Book flights",
        due = LocalDate(2026, 10, 1),
        category = annaWork.id,
        collection = "col",
        board = "todo",
    )
    private val boards = listOf(
        board("doing", "col", position = 1.0),
        board("todo", "col", position = 0.0),
        board("done", "col", position = 2.0, done = true),
        board("elsewhere", "other", position = 0.0),
    )

    private fun subject(data: FakeTasksDataSource) = TaskDetailViewModel("t1", data, FixedClock, TaskDeletions(FixedClock))

    @Test
    fun `loads the task with its collection columns, subtasks and eligible contexts`() = runTest {
        val data = FakeTasksDataSource(
            tasks = listOf(
                original,
                task("s2", parent = "t1", position = 2.0),
                task("s1", parent = "t1", position = 1.0, done = true),
            ),
            boards = boards,
            categories = listOf(sharedHome, annaWork, annaWork.copy(id = "cat-boris", ownerId = BORIS)),
        )
        val vm = subject(data)
        keepCollecting(vm.state)

        val state = vm.state.value
        assertEquals(original, state.task)
        assertTrue(state.canEdit)
        assertEquals(listOf("todo", "doing", "done"), state.boards.map { it.id })
        assertEquals(listOf("s1", "s2"), state.subtasks.map { it.task.id })
        assertEquals(1, state.progress?.done)
        assertEquals(listOf(sharedHome.id, annaWork.id), state.categories.map { it.id })
        assertTrue(state.overdue)
        assertFalse(state.dirty)
    }

    @Test
    fun `save writes only the changed fields, guarded by updated_at`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original), boards = boards)
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.setTitle("  Book train  ")
        vm.setNotes("Window seat")
        vm.setPriority(TaskPriority.High)
        vm.setAssignee(BORIS)
        vm.setDueDate(null)
        assertTrue(vm.state.value.dirty)
        vm.save()

        val (id, patch, expected) = data.updates.single()
        assertEquals("t1", id)
        assertEquals(original.updatedAt, expected)
        assertEquals(
            TaskPatch(
                title = PatchField.Value("Book train"),
                description = PatchField.Value("Window seat"),
                priority = PatchField.Value(3),
                assigneeId = PatchField.Value(BORIS),
                dueDate = PatchField.Value(null),
            ),
            patch,
        )
        assertTrue(vm.state.value.saved)
        assertFalse(vm.state.value.dirty)
    }

    @Test
    fun `moving to a done column completes the task`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original), boards = boards)
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.setBoard(boards.first { it.id == "done" })
        assertTrue(vm.state.value.form!!.done)
        assertFalse(vm.state.value.overdue, "a done task is never overdue")
        vm.save()

        val patch = data.updates.single().second
        assertEquals(PatchField.Value("done"), patch.boardId)
        assertEquals(PatchField.Value(NOW), patch.completedAt)
    }

    @Test
    fun `a task outside any collection can't change its completion`() = runTest {
        val loose = task("t1", done = true)
        val data = FakeTasksDataSource(tasks = listOf(loose))
        val vm = subject(data)
        keepCollecting(vm.state)

        assertTrue(vm.state.value.boards.isEmpty())
        // Even a form flipped to "open" writes nothing: completed_at only moves with a board.
        assertEquals(TaskPatch(), TaskForm.from(loose).copy(done = false).toPatch(loose, NOW))
    }

    @Test
    fun `an unchanged form closes without writing`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.save()

        assertTrue(data.updates.isEmpty())
        assertTrue(vm.state.value.saved)
    }

    @Test
    fun `an edit undone by hand leaves nothing to discard`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.setTitle("Book train")
        assertTrue(vm.state.value.dirty)
        vm.setTitle("Book flights")

        // The back guard and Save follow `dirty`: nothing actually changed.
        assertFalse(vm.state.value.dirty)
    }

    @Test
    fun `a blank title is refused before any write`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.setTitle("   ")
        vm.save()

        assertTrue(data.updates.isEmpty())
        assertEquals(TaskDetailNotice.TitleRequired, vm.state.value.notice)
    }

    @Test
    fun `a save in flight stays saving and dirty until it lands`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)
        val gate = CompletableDeferred<Unit>()
        data.updateGate = gate

        vm.setTitle("Book train")
        vm.save()

        // The screen holds Back on `saving`: no discard prompt, no pop that cancels the write.
        assertTrue(vm.state.value.saving)
        assertTrue(vm.state.value.dirty)
        assertFalse(vm.state.value.saved)
        vm.setTitle("Edited meanwhile")
        assertEquals("Book train", vm.state.value.form?.title, "the form is frozen while saving")

        gate.complete(Unit)
        assertFalse(vm.state.value.saving)
        assertTrue(vm.state.value.saved)
    }

    @Test
    fun `a stale write keeps the edits and says so`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.setTitle("Mine")
        data.failWith = StaleWriteException("tasks", "t1")
        vm.save()

        val state = vm.state.value
        assertEquals(TaskDetailNotice.Stale, state.notice)
        assertEquals("Mine", state.form?.title)
        assertFalse(state.saving)
        assertFalse(state.saved)
    }

    @Test
    fun `the partner's task is read-only`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(task("t1", owner = BORIS)))
        val vm = subject(data)
        keepCollecting(vm.state)

        assertFalse(vm.state.value.canEdit)
        assertEquals(boris, vm.state.value.owner)
        vm.setTitle("Hijacked")
        vm.save()

        assertEquals("Task t1", vm.state.value.form?.title)
        assertTrue(data.updates.isEmpty())
    }

    @Test
    fun `a missing task reports not found`() = runTest {
        val vm = subject(FakeTasksDataSource())
        keepCollecting(vm.state)

        assertFalse(vm.state.value.loading)
        assertNull(vm.state.value.task)
    }

    @Test
    fun `remote changes flow into an untouched form`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)

        data.tasks.value = listOf(original.copy(title = "Renamed on the web"))

        assertEquals("Renamed on the web", vm.state.value.form?.title)
        assertFalse(vm.state.value.dirty)
    }
}
