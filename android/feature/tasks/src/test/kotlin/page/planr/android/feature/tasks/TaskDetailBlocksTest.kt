package page.planr.android.feature.tasks

import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Rule
import page.planr.android.feature.tasks.detail.BlockNotice
import page.planr.android.feature.tasks.detail.TaskDeletions
import page.planr.android.feature.tasks.detail.TaskDetailNotice
import page.planr.android.feature.tasks.detail.TaskDetailViewModel

/** The detail's calendar blocks: listing, "Add to calendar" and removal, each with Undo. */
class TaskDetailBlocksTest {
    @get:Rule val main = MainDispatcherRule()

    private val attributes = buildJsonObject { put("energy", "high") }
    private val original = task("t1", title = "Write report", due = LocalDate(2026, 10, 6), category = annaWork.id)
        .copy(description = "Draft first", isPrivate = false, attributes = attributes)

    private fun subject(data: FakeTasksDataSource, id: String = "t1") =
        TaskDetailViewModel(id, data, FixedClock, TaskDeletions(FixedClock))

    private fun at(iso: String) = Instant.parse(iso)

    @Test
    fun `lists the task's blocks, upcoming soonest first, then past latest first`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.events.value = listOf(
            blockEvent("past-old", "t1", at("2026-09-28T09:00:00Z"), at("2026-09-28T10:00:00Z")),
            blockEvent("later", "t1", at("2026-10-08T09:00:00Z"), at("2026-10-08T10:00:00Z")),
            blockEvent("past-recent", "t1", at("2026-10-03T09:00:00Z"), at("2026-10-03T10:00:00Z")),
            // Under way at NOW (10:00): still upcoming.
            blockEvent("now", "t1", at("2026-10-04T09:30:00Z"), at("2026-10-04T10:30:00Z")),
            blockEvent("partner", "t1", at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z"), owner = BORIS),
            blockEvent("other-task", "t2", at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z")),
        )
        val vm = subject(data)
        keepCollecting(vm.state)

        val blocks = vm.state.value.blocks
        assertEquals(listOf("now", "partner", "later", "past-recent", "past-old"), blocks.map { it.event.id })
        assertEquals(listOf(false, false, false, true, true), blocks.map { it.past })
        assertEquals(listOf(true, false, true, true, true), blocks.map { it.canRemove })
        assertEquals(1, data.blockRefreshes)
        assertTrue(vm.state.value.canSchedule)
    }

    @Test
    fun `the sheet opens on a future due date at the first free slot`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.calendar = listOf(
            occurrence("mine", at("2026-10-06T08:00:00Z"), at("2026-10-06T09:00:00Z")),
            occurrence("ours", at("2026-10-06T09:00:00Z"), at("2026-10-06T09:20:00Z"), owner = BORIS, shared = true),
            // The partner's own event doesn't take Anna's time.
            occurrence("theirs", at("2026-10-06T09:30:00Z"), at("2026-10-06T11:00:00Z"), owner = BORIS),
        )
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.openBlockSheet()

        val sheet = assertNotNull(vm.state.value.blockSheet)
        assertEquals(LocalDate(2026, 10, 6), sheet.date)
        assertEquals(30, sheet.minutes)
        assertEquals(LocalTime(9, 30), sheet.start)
        assertEquals(at("2026-10-06T00:00:00Z"), data.occurrenceReads.single().first.start)
    }

    @Test
    fun `a past due date opens on today, after now`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original.copy(dueDate = LocalDate(2026, 10, 1))))
        data.calendar = listOf(occurrence("standup", at("2026-10-04T10:00:00Z"), at("2026-10-04T10:40:00Z")))
        val vm = subject(data)
        keepCollecting(vm.state)

        vm.openBlockSheet()

        val sheet = assertNotNull(vm.state.value.blockSheet)
        assertEquals(TODAY, sheet.date)
        assertEquals(LocalTime(10, 45), sheet.start)
    }

    @Test
    fun `late in the evening the sheet opens on tomorrow, not on today's past midnight`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original.copy(dueDate = LocalDate(2026, 10, 1))))
        val late = object : Clock {
            override fun now() = at("2026-10-04T23:20:00Z")
        }
        val vm = TaskDetailViewModel("t1", data, late, TaskDeletions(late))
        keepCollecting(vm.state)

        vm.openBlockSheet()

        val sheet = assertNotNull(vm.state.value.blockSheet)
        assertEquals(LocalDate(2026, 10, 5), sheet.date)
        assertEquals(LocalTime(8, 0), sheet.start)
    }

    @Test
    fun `changing the day or duration moves the start until the user picks one`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.calendar = listOf(
            occurrence("a", at("2026-10-06T08:00:00Z"), at("2026-10-06T09:00:00Z")),
            occurrence("b", at("2026-10-06T09:30:00Z"), at("2026-10-06T10:00:00Z")),
            occurrence("c", at("2026-10-07T08:00:00Z"), at("2026-10-07T12:00:00Z")),
        )
        val vm = subject(data)
        keepCollecting(vm.state)
        vm.openBlockSheet()
        assertEquals(LocalTime(9, 0), vm.state.value.blockSheet?.start)

        vm.setBlockMinutes(60)
        assertEquals(LocalTime(10, 0), vm.state.value.blockSheet?.start)

        vm.setBlockDate(LocalDate(2026, 10, 7))
        assertEquals(LocalTime(12, 0), vm.state.value.blockSheet?.start)

        vm.setBlockStart(LocalTime(16, 15))
        vm.setBlockDate(LocalDate(2026, 10, 6))
        vm.setBlockMinutes(15)
        val sheet = assertNotNull(vm.state.value.blockSheet)
        assertEquals(LocalTime(16, 15), sheet.start)
        assertEquals(15, sheet.minutes)
    }

    @Test
    fun `a failed cache read keeps the next full hour`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)
        data.failWith = IOException("offline")

        vm.openBlockSheet()

        assertEquals(LocalTime(11, 0), vm.state.value.blockSheet?.start)
    }

    @Test
    fun `a late cache read doesn't overwrite a newer pick`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)
        val gate = CompletableDeferred<Unit>()
        data.occurrenceGate = gate

        vm.openBlockSheet()
        vm.setBlockStart(LocalTime(18, 0))
        gate.complete(Unit)

        assertEquals(LocalTime(18, 0), vm.state.value.blockSheet?.start)
    }

    @Test
    fun `add creates a linked block like the web dialog, without touching the form`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)
        vm.setNotes("Unsaved edit")
        vm.openBlockSheet()
        vm.setBlockStart(LocalTime(14, 0))
        vm.setBlockMinutes(90)

        vm.createBlock()

        val draft = data.createdEvents.single()
        assertEquals("t1", draft.taskId)
        assertEquals("Write report", draft.title)
        assertEquals(annaWork.id, draft.categoryId)
        assertEquals(ANNA, draft.ownerId)
        assertEquals(WS, draft.workspaceId)
        assertEquals("Draft first", draft.description)
        assertFalse(draft.isPrivate)
        assertFalse(draft.allDay)
        assertEquals(attributes, draft.attributes)
        assertEquals("UTC", draft.timeZone)
        assertEquals(at("2026-10-06T14:00:00Z"), draft.start)
        assertEquals(at("2026-10-06T15:30:00Z"), draft.end)

        val state = vm.state.value
        assertNull(state.blockSheet)
        assertEquals(BlockNotice.Added("ev-1"), state.blockNotice)
        assertEquals(listOf("ev-1"), state.blocks.map { it.event.id })
        // The edit is still there and still the only thing making the form dirty.
        assertTrue(state.dirty)
        assertEquals("Unsaved edit", state.form?.notes)
        assertTrue(data.updates.isEmpty())
    }

    @Test
    fun `undo of an add deletes the new block`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)
        vm.openBlockSheet()
        vm.createBlock()
        val notice = assertNotNull(vm.state.value.blockNotice)

        vm.undoBlock(notice)

        assertEquals(listOf("ev-1"), data.deletedEventIds)
        assertTrue(vm.state.value.blocks.isEmpty())
        assertNull(vm.state.value.blockNotice)
    }

    @Test
    fun `a failed add keeps the sheet open to retry`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)
        vm.openBlockSheet()
        vm.setBlockStart(LocalTime(14, 0))
        data.failWith = IOException("offline")

        vm.createBlock()

        val state = vm.state.value
        val sheet = assertNotNull(state.blockSheet)
        assertFalse(sheet.saving)
        assertEquals(LocalTime(14, 0), sheet.start)
        assertEquals(TaskDetailNotice.Failed, state.notice)
        assertNull(state.blockNotice)
        assertFalse(state.blockWriting)
    }

    @Test
    fun `while a block is written, save and delete wait and the sheet stays`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        val vm = subject(data)
        keepCollecting(vm.state)
        vm.setTitle("Write the report")
        vm.openBlockSheet()
        val gate = CompletableDeferred<Unit>()
        data.eventGate = gate

        vm.createBlock()
        assertTrue(vm.state.value.blockWriting)
        vm.save()
        vm.delete()
        vm.dismissBlockSheet()
        vm.setBlockMinutes(120)

        assertTrue(data.updates.isEmpty())
        assertTrue(data.blockChecks.isEmpty())
        assertEquals(30, vm.state.value.blockSheet?.minutes)
        gate.complete(Unit)
        assertFalse(vm.state.value.blockWriting)
        assertNull(vm.state.value.blockSheet)

        vm.save()
        assertEquals(1, data.updates.size)
    }

    @Test
    fun `remove deletes the block, and undo puts it back`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.events.value = listOf(blockEvent("b1", "t1", at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z")))
        val vm = subject(data)
        keepCollecting(vm.state)
        val gate = CompletableDeferred<Unit>()
        data.eventGate = gate

        vm.removeBlock("b1")
        assertTrue(vm.state.value.blocks.single().pending)
        assertTrue(vm.state.value.blockWriting)
        gate.complete(Unit)

        assertEquals(listOf("b1"), data.deletedEventIds)
        assertTrue(vm.state.value.blocks.isEmpty())
        val notice = assertNotNull(vm.state.value.blockNotice)
        assertTrue(notice is BlockNotice.Removed)
        assertFalse(vm.state.value.dirty)

        vm.undoBlock(notice)

        assertEquals(listOf("b1"), data.restoredEventIds)
        assertEquals(listOf("b1"), vm.state.value.blocks.map { it.event.id })
        assertNull(vm.state.value.blockNotice)
    }

    @Test
    fun `undo is ignored while the task is being deleted`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.events.value = listOf(blockEvent("b1", "t1", at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z")))
        val vm = subject(data)
        keepCollecting(vm.state)
        vm.removeBlock("b1")
        val notice = assertNotNull(vm.state.value.blockNotice)
        val gate = CompletableDeferred<Unit>()
        data.deleteGate = gate

        vm.delete()
        assertTrue(vm.state.value.deleting)
        vm.undoBlock(notice)

        assertTrue(data.restoredEventIds.isEmpty())
        assertFalse(vm.state.value.blockWriting)
        gate.complete(Unit)
    }

    @Test
    fun `a failed remove keeps the block and says so`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.events.value = listOf(blockEvent("b1", "t1", at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z")))
        val vm = subject(data)
        keepCollecting(vm.state)
        data.failWith = IOException("offline")

        vm.removeBlock("b1")

        assertEquals(listOf("b1"), vm.state.value.blocks.map { it.event.id })
        assertFalse(vm.state.value.blocks.single().pending)
        assertEquals(TaskDetailNotice.Failed, vm.state.value.notice)
        assertNull(vm.state.value.blockNotice)
    }

    @Test
    fun `a dismissed notice is only cleared if it is still the latest`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.events.value = listOf(blockEvent("b1", "t1", at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z")))
        val vm = subject(data)
        keepCollecting(vm.state)
        vm.openBlockSheet()
        vm.createBlock()
        val added = assertNotNull(vm.state.value.blockNotice)
        vm.removeBlock("b1")

        vm.dismissBlockNotice(added)

        assertTrue(vm.state.value.blockNotice is BlockNotice.Removed)
    }

    @Test
    fun `the partner can see blocks but not add or remove them`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original), viewer = BORIS)
        data.events.value = listOf(blockEvent("b1", "t1", at("2026-10-05T09:00:00Z"), at("2026-10-05T10:00:00Z")))
        val vm = subject(data)
        keepCollecting(vm.state)

        assertFalse(vm.state.value.canSchedule)
        assertFalse(vm.state.value.blocks.single().canRemove)
        vm.openBlockSheet()
        vm.removeBlock("b1")

        assertNull(vm.state.value.blockSheet)
        assertTrue(data.deletedEventIds.isEmpty())
    }

    @Test
    fun `a failed block refresh is silent`() = runTest {
        val data = FakeTasksDataSource(tasks = listOf(original))
        data.failWith = IOException("offline")
        val vm = subject(data)
        keepCollecting(vm.state)

        assertEquals(1, data.blockRefreshes)
        assertNull(vm.state.value.notice)
    }
}
