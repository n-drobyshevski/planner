package page.planr.android.feature.quickadd

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
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
        var failWith: Exception? = null
        var zoneGate: CompletableDeferred<Unit>? = null

        override suspend fun viewerZone(): TimeZone {
            zoneGate?.await()
            return zone
        }

        override suspend fun createTask(title: String, dueDate: LocalDate?): Task {
            failWith?.let { throw it }
            tasks += title to dueDate
            return Task(id = "t", workspaceId = "ws", ownerId = "me", title = title, createdAt = Instant.DISTANT_PAST, updatedAt = Instant.DISTANT_PAST)
        }

        override suspend fun createEvent(title: String, start: Instant, end: Instant, allDay: Boolean, zone: TimeZone): PlannerEvent {
            failWith?.let { throw it }
            events += listOf(title, start, end, allDay, zone.id)
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
        assertEquals(QuickAddKind.Task, vm.state.value.saved)
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
        assertEquals(QuickAddKind.Event, vm.state.value.saved)
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
        assertEquals(QuickAddKind.Task, vm.state.value.saved)

        vm.start(QuickAddKind.Event)

        assertNull(vm.state.value.saved)
        assertEquals("", vm.state.value.form.title)
        assertEquals(QuickAddKind.Event, vm.state.value.form.kind)
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
}
