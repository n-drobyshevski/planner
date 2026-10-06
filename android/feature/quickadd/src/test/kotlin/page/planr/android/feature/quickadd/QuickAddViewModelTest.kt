package page.planr.android.feature.quickadd

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import org.junit.Rule
import page.planr.android.core.data.auth.NotSignedInException
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.Task
import page.planr.android.feature.quickadd.data.QuickAddDataSource
import page.planr.android.feature.quickadd.model.QuickAddError
import page.planr.android.feature.quickadd.model.SharedText

@OptIn(ExperimentalCoroutinesApi::class)
class QuickAddViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    /** 2026-10-04 08:10 UTC = 10:10 in Berlin. */
    private val now = Instant.parse("2026-10-04T08:10:00Z")
    private val clock = object : Clock {
        override fun now(): Instant = now
    }

    private class FakeQuickAdd(var zone: TimeZone = TimeZone.of("Europe/Berlin")) : QuickAddDataSource {
        val tasks = mutableListOf<Pair<String, LocalDate?>>()
        val events = mutableListOf<List<Any>>()
        /** The description of every create, task or event, in order. */
        val descriptions = mutableListOf<String?>()
        val deletedTasks = mutableListOf<String>()
        val deletedEvents = mutableListOf<String>()
        var failWith: Exception? = null
        var failDeleteWith: Exception? = null
        var zoneGate: CompletableDeferred<Unit>? = null
        var createGate: CompletableDeferred<Unit>? = null
        var successToasts = true
        var failToastsWith: Exception? = null

        override suspend fun showSuccessToasts(): Boolean {
            failToastsWith?.let { throw it }
            return successToasts
        }

        override suspend fun viewerZone(): TimeZone {
            zoneGate?.await()
            return zone
        }

        override suspend fun createTask(title: String, dueDate: LocalDate?, description: String?): Task {
            createGate?.await()
            failWith?.let { throw it }
            tasks += title to dueDate
            descriptions += description
            return Task(id = "t", workspaceId = "ws", ownerId = "me", title = title, createdAt = Instant.DISTANT_PAST, updatedAt = Instant.DISTANT_PAST)
        }

        override suspend fun createEvent(
            title: String,
            start: Instant,
            end: Instant,
            allDay: Boolean,
            zone: TimeZone,
            description: String?,
        ): PlannerEvent {
            failWith?.let { throw it }
            events += listOf(title, start, end, allDay, zone.id)
            descriptions += description
            return PlannerEvent(
                id = "e",
                workspaceId = "ws",
                ownerId = "me",
                title = title,
                start = start,
                end = end,
                timeZone = zone.id,
                createdAt = Instant.DISTANT_PAST,
                updatedAt = Instant.DISTANT_PAST,
            )
        }

        override suspend fun deleteTask(id: String) {
            failDeleteWith?.let { throw it }
            deletedTasks += id
        }

        override suspend fun deleteEvent(id: String) {
            failDeleteWith?.let { throw it }
            deletedEvents += id
        }
    }

    @Test
    fun `start resolves the member's zone for today and the default times`() = runTest {
        val vm = QuickAddViewModel(FakeQuickAdd(), clock)
        vm.start(QuickAddKind.Event)

        val state = vm.state.value
        assertEquals(QuickAddKind.Event, state.form.kind)
        assertEquals(LocalDate(2026, 10, 4), state.today)
        assertEquals(LocalDate(2026, 10, 5), state.tomorrow)
        assertEquals(LocalTime(10, 30), state.form.startTime)
        assertEquals(LocalTime(11, 30), state.form.endTime)
    }

    @Test
    fun `a task is created with its title and due date`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)

        vm.setTitle("Buy stamps")
        vm.setDueDate(vm.state.value.tomorrow)
        vm.save()

        assertEquals(listOf<Pair<String, LocalDate?>>("Buy stamps" to LocalDate(2026, 10, 5)), data.tasks)
        assertEquals(QuickAddKind.Task, vm.state.value.saved?.kind)
        assertTrue(data.events.isEmpty())
    }

    @Test
    fun `an event is created in the viewer's zone`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)

        vm.setKind(QuickAddKind.Event)
        vm.setTitle("Dentist")
        vm.setStartTime(LocalTime(15, 0))
        vm.save()

        assertEquals(
            listOf<Any>("Dentist", Instant.parse("2026-10-04T13:00:00Z"), Instant.parse("2026-10-04T14:00:00Z"), false, "Europe/Berlin"),
            data.events.single(),
        )
        assertEquals(QuickAddKind.Event, vm.state.value.saved?.kind)
    }

    @Test
    fun `an all-day event spans the UTC day`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Event)

        vm.setTitle("Holiday")
        vm.setDate(LocalDate(2026, 12, 24))
        vm.setAllDay(true)
        vm.save()

        val (_, start, end, allDay) = data.events.single()
        assertEquals(Instant.parse("2026-12-24T00:00:00Z"), start)
        assertEquals(Instant.parse("2026-12-25T00:00:00Z"), end)
        assertEquals(true, allDay)
    }

    @Test
    fun `a blank title is refused without a write`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)

        vm.save()

        assertEquals(QuickAddError.TitleRequired, vm.state.value.error)
        assertTrue(data.tasks.isEmpty())
        vm.setTitle("x")
        assertNull(vm.state.value.error, "typing clears the error")
    }

    @Test
    fun `failures keep the draft and explain`() = runTest {
        val data = FakeQuickAdd().apply { failWith = NotSignedInException() }
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)
        vm.setTitle("Call mum")

        vm.save()
        assertEquals(QuickAddError.NotSignedIn, vm.state.value.error)

        data.failWith = IllegalStateException("offline")
        vm.save()
        val state = vm.state.value
        assertEquals(QuickAddError.Failed, state.error)
        assertEquals("Call mum", state.form.title)
        assertNull(state.saved)
        assertEquals(false, state.saving)
    }

    @Test
    fun `start resets a previous opening`() = runTest {
        val vm = QuickAddViewModel(FakeQuickAdd(), clock)
        vm.start(QuickAddKind.Task)
        vm.setTitle("Old")
        vm.save()
        assertEquals(QuickAddKind.Task, vm.state.value.saved?.kind)

        vm.start(QuickAddKind.Event)

        assertNull(vm.state.value.saved)
        assertEquals("", vm.state.value.form.title)
        assertEquals(QuickAddKind.Event, vm.state.value.form.kind)
    }

    @Test
    fun `a save still in flight when the sheet was closed can't close the next opening`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val data = FakeQuickAdd().apply { createGate = gate }
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)
        vm.setTitle("Slow network")
        vm.save()
        assertTrue(vm.state.value.saving)

        // Cancelled while saving, then opened again and typed into.
        vm.start(QuickAddKind.Task)
        vm.setTitle("Next")
        gate.complete(Unit)

        assertEquals(listOf<Pair<String, LocalDate?>>("Slow network" to null), data.tasks)
        assertNull(vm.state.value.saved)
        assertEquals("Next", vm.state.value.form.title)
        assertTrue(vm.state.value.hasDraft)
    }

    @Test
    fun `only a typed title is a draft worth asking about`() = runTest {
        val vm = QuickAddViewModel(FakeQuickAdd(), clock)
        vm.start(QuickAddKind.Event)
        assertFalse(vm.state.value.hasDraft)

        vm.setDate(LocalDate(2026, 10, 9))
        vm.setTitle("   ")
        assertFalse(vm.state.value.hasDraft, "defaults and blanks close without asking")

        vm.setTitle("Dinner")
        assertTrue(vm.state.value.hasDraft)

        vm.save()
        assertFalse(vm.state.value.hasDraft, "a saved item is no longer a draft")
    }

    @Test
    fun `a zone that arrives late moves untouched defaults but never a picked time`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val data = FakeQuickAdd(zone = TimeZone.of("Asia/Tokyo")).apply { zoneGate = gate }
        val vm = QuickAddViewModel(data, clock)

        vm.start(QuickAddKind.Event)
        gate.complete(Unit)
        assertEquals(LocalTime(17, 30), vm.state.value.form.startTime, "08:30Z is 17:30 in Tokyo")

        val later = CompletableDeferred<Unit>()
        data.zoneGate = later
        data.zone = TimeZone.of("America/New_York")
        vm.start(QuickAddKind.Event)
        vm.setStartTime(LocalTime(7, 0))
        later.complete(Unit)

        assertEquals(LocalTime(7, 0), vm.state.value.form.startTime)
        assertEquals(LocalDate(2026, 10, 4), vm.state.value.today)
    }

    @Test
    fun `shared text prefills a task whose notes reach the save`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task, SharedText(title = "Read this", notes = "Read this\nhttps://example.com/post"))

        assertEquals("Read this", vm.state.value.form.title)
        vm.save()

        assertEquals(listOf<Pair<String, LocalDate?>>("Read this" to null), data.tasks)
        assertEquals(listOf<String?>("Read this\nhttps://example.com/post"), data.descriptions)
    }

    @Test
    fun `typed notes are saved trimmed with an event, and blank notes as none`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Event)
        vm.setTitle("Dinner")
        vm.setNotes("  Table for two  \n")
        vm.save()

        vm.start(QuickAddKind.Task)
        vm.setTitle("Stamps")
        vm.setNotes("   ")
        vm.save()

        assertEquals(listOf<String?>("Table for two", null), data.descriptions)
    }

    @Test
    fun `notes alone are a draft worth asking about`() = runTest {
        val vm = QuickAddViewModel(FakeQuickAdd(), clock)
        vm.start(QuickAddKind.Task)
        vm.setNotes("Bring the receipt")
        assertTrue(vm.state.value.hasDraft)

        vm.start(QuickAddKind.Task, SharedText(title = "", notes = "shared"))
        assertTrue(vm.state.value.hasDraft, "shared text is a draft before any typing")
    }

    @Test
    fun `saving reports the created row, and undo deletes exactly it`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)
        vm.setTitle("Buy stamps")
        vm.save()
        val task = assertNotNull(vm.state.value.saved)
        assertEquals(QuickAddSaved(QuickAddKind.Task, "t"), task)

        vm.start(QuickAddKind.Event)
        vm.setTitle("Dentist")
        vm.save()
        val event = assertNotNull(vm.state.value.saved)
        assertEquals(QuickAddSaved(QuickAddKind.Event, "e"), event)

        // The sheet has been reopened since: undo still targets what each confirmation named.
        vm.start(QuickAddKind.Task)
        vm.undo(task)
        vm.undo(event)

        assertEquals(listOf("t"), data.deletedTasks)
        assertEquals(listOf("e"), data.deletedEvents)
    }

    @Test
    fun `an undo that fails is reported and leaves the item`() = runTest {
        val data = FakeQuickAdd().apply { failDeleteWith = IllegalStateException("offline") }
        val vm = QuickAddViewModel(data, clock)
        val failures = mutableListOf<QuickAddSaved>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.undoFailures.collect { failures += it } }
        vm.start(QuickAddKind.Task)
        vm.setTitle("Call mum")
        vm.save()

        val saved = assertNotNull(vm.state.value.saved)
        vm.undo(saved)
        runCurrent()

        assertEquals(listOf(saved), failures)
        assertTrue(data.deletedTasks.isEmpty())
    }

    @Test
    fun `a save confirms only when the member wants success toasts`() = runTest {
        val data = FakeQuickAdd()
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)
        vm.setTitle("Buy stamps")
        vm.save()
        assertEquals(true, vm.state.value.saved?.confirm)

        data.successToasts = false
        vm.start(QuickAddKind.Event)
        vm.setTitle("Dentist")
        vm.save()
        assertEquals(QuickAddSaved(QuickAddKind.Event, "e", confirm = false), vm.state.value.saved)
    }

    @Test
    fun `a preference that can't be read keeps the confirmation and the save`() = runTest {
        val data = FakeQuickAdd().apply { failToastsWith = IllegalStateException("no member yet") }
        val vm = QuickAddViewModel(data, clock)
        vm.start(QuickAddKind.Task)
        vm.setTitle("Buy stamps")
        vm.save()

        assertEquals(QuickAddSaved(QuickAddKind.Task, "t", confirm = true), vm.state.value.saved)
        assertEquals(null, vm.state.value.error)
    }
}
