package page.planr.android.feature.inbox

import androidx.lifecycle.viewModelScope
import java.io.IOException
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.data.inbox.InboxItem
import page.planr.android.core.data.inbox.InboxRules
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.design.component.SleepRatingDraft
import page.planr.android.core.model.PlannerEventDraft

@OptIn(ExperimentalCoroutinesApi::class)
class InboxViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val berlin = TimeZone.of("Europe/Berlin")
    private val oct5 = LocalDate(2026, 10, 5)
    private val oct6 = LocalDate(2026, 10, 6)

    /** Every night of the last week rated except the 5th and the 6th. */
    private val ratedWeek = listOf(30).map { LocalDate(2026, 9, it) }.plus((1..4).map { LocalDate(2026, 10, it) })
        .map { SleepLog(it, quality = 5) }

    private fun data(): FakeInboxDataSource = FakeInboxDataSource().apply {
        serverLogs = ratedWeek
        serverRequests = listOf(TestData.request("r1"))
        occurrences.value = listOf(
            TestData.event("ev", "Standup"),
            TestData.event("partner-ev", ownerId = FakeInboxDataSource.PARTNER),
        )
        tasks.value = listOf(TestData.task("tk", "Ship"))
    }

    private fun TestScope.viewModel(data: FakeInboxDataSource): InboxViewModel {
        val vm = InboxViewModel(data, TestData.clock, backgroundScope)
        keepCollecting(vm.state)
        runCurrent()
        return vm
    }

    private fun InboxViewModel.close() = viewModelScope.cancel()

    private fun InboxUiState.ids(): List<String> = (requests + ratings + nights).map { it.id }

    @Test
    fun `lists requests, then ratings newest first, then unlogged nights, in the viewer's zone`() = runTest {
        val data = data()
        val vm = viewModel(data)

        val state = vm.state.value
        assertFalse(state.loading)
        assertEquals(listOf("request:r1"), state.requests.map { it.id })
        assertEquals(listOf("rate-event:ev", "rate-task:tk"), state.ratings.map { it.id })
        assertEquals(listOf(oct6, oct5), state.nights.map { it.date })
        assertEquals(berlin, state.zone)
        assertEquals(5, state.count)
        assertEquals(listOf(InboxRules.occurrenceWindow(TestData.NOW, berlin)), data.refreshedWindows)
        vm.close()
    }

    @Test
    fun `leaves the nights out until they are read, and stops loading when the reads fail`() = runTest {
        val data = data().apply { failRefresh = IOException("offline") }
        val vm = viewModel(data)

        val state = vm.state.value
        assertFalse(state.loading)
        assertEquals(emptyList(), state.nights)
        assertEquals(emptyList(), state.requests)
        assertEquals(listOf("rate-event:ev", "rate-task:tk"), state.ratings.map { it.id })
        vm.close()
    }

    @Test
    fun `says nothing waits when nothing does`() = runTest {
        val data = FakeInboxDataSource().apply { serverLogs = ratedWeek + SleepLog(oct5, note = "ok") + SleepLog(oct6, fatigue = 3) }
        val vm = viewModel(data)

        assertFalse(vm.state.value.loading)
        assertEquals(0, vm.state.value.count)
        vm.close()
    }

    @Test
    fun `rating an event hides it at once and merges satisfaction into its attributes`() = runTest {
        val data = data()
        data.occurrences.value = listOf(TestData.event("ev", attributes = JsonObject(mapOf("energy" to JsonPrimitive(2)))))
        val vm = viewModel(data)
        data.hold = CompletableDeferred()

        vm.rate(vm.state.value.ratings.first { it is InboxItem.RateEvent }, "3")
        runCurrent()
        assertEquals(listOf("rate-task:tk"), vm.state.value.ratings.map { it.id }) // optimistic
        assertEquals(emptyList(), data.ratedEvents)

        data.hold!!.complete(Unit)
        runCurrent()
        assertEquals(
            listOf("ev" to JsonObject(mapOf("energy" to JsonPrimitive(2), "satisfaction" to JsonPrimitive(3)))),
            data.ratedEvents,
        )
        assertEquals(listOf("rate-task:tk"), vm.state.value.ratings.map { it.id })
        assertNull(vm.state.value.error)
        vm.close()
    }

    @Test
    fun `a rating merges into the attributes as stored when it's written, not the row's old copy`() = runTest {
        val data = data()
        data.occurrences.value = listOf(TestData.event("ev", attributes = JsonObject(mapOf("energy" to JsonPrimitive(2)))))
        val vm = viewModel(data)
        data.hold = CompletableDeferred()

        vm.rate(vm.state.value.ratings.first { it is InboxItem.RateEvent }, "3")
        runCurrent()
        // The partner's attribute lands before the write does.
        data.occurrences.value = listOf(
            TestData.event("ev", attributes = JsonObject(mapOf("energy" to JsonPrimitive(2), "priority" to JsonPrimitive(1)))),
        )
        data.hold!!.complete(Unit)
        runCurrent()

        assertEquals(
            JsonObject(mapOf("energy" to JsonPrimitive(2), "priority" to JsonPrimitive(1), "satisfaction" to JsonPrimitive(3))),
            data.ratedEvents.single().second,
        )
        vm.close()
    }

    @Test
    fun `a rating that a change elsewhere got ahead of comes back to rate again`() = runTest {
        val data = data().apply { failRate = StaleWriteException(SupabaseTables.TASKS, "tk") }
        val vm = viewModel(data)

        vm.rate(vm.state.value.ratings.first { it is InboxItem.RateTask }, "2")
        runCurrent()

        assertEquals(listOf("rate-event:ev", "rate-task:tk"), vm.state.value.ratings.map { it.id })
        assertEquals(InboxError.RateFailed, vm.state.value.error)
        assertEquals(emptyList(), data.ratedTasks)
        vm.close()
    }

    @Test
    fun `rating a task writes through the task path`() = runTest {
        val data = data()
        val vm = viewModel(data)

        vm.rate(vm.state.value.ratings.first { it is InboxItem.RateTask }, "1")
        runCurrent()

        assertEquals(listOf("tk" to JsonObject(mapOf("satisfaction" to JsonPrimitive(1)))), data.ratedTasks)
        assertEquals(listOf("rate-event:ev"), vm.state.value.ratings.map { it.id })
        vm.close()
    }

    @Test
    fun `a rating that fails comes back with a calm error, cleared by the next action`() = runTest {
        val data = data().apply { failRate = IOException("offline") }
        val vm = viewModel(data)

        vm.rate(vm.state.value.ratings.first(), "4")
        runCurrent()

        assertEquals(listOf("rate-event:ev", "rate-task:tk"), vm.state.value.ratings.map { it.id })
        assertEquals(InboxError.RateFailed, vm.state.value.error)

        data.failRate = null
        vm.rate(vm.state.value.ratings.first(), "4")
        runCurrent()
        assertNull(vm.state.value.error)
        vm.close()
    }

    @Test
    fun `the error line goes on its own after a few seconds`() = runTest {
        val data = data().apply { failRate = IOException("offline") }
        val vm = viewModel(data)

        vm.rate(vm.state.value.ratings.first(), "4")
        runCurrent()
        advanceTimeBy(InboxViewModel.ERROR_VISIBLE_MS - 1)
        runCurrent()
        assertEquals(InboxError.RateFailed, vm.state.value.error)

        advanceTimeBy(2)
        runCurrent()
        assertNull(vm.state.value.error)
        vm.close()
    }

    @Test
    fun `a second failure shows for its own full time`() = runTest {
        val data = data().apply { failDecline = IOException("offline") }
        val vm = viewModel(data)

        vm.decline(vm.state.value.requests.first())
        runCurrent()
        advanceTimeBy(InboxViewModel.ERROR_VISIBLE_MS - 1_000)
        vm.decline(vm.state.value.requests.first())
        runCurrent()
        advanceTimeBy(2_000)
        runCurrent()
        assertEquals(InboxError.RequestFailed, vm.state.value.error)
        vm.close()
    }

    @Test
    fun `tapping the error line or coming back to the screen clears it`() = runTest {
        val data = data().apply { failRate = IOException("offline") }
        val vm = viewModel(data)

        vm.rate(vm.state.value.ratings.first(), "4")
        runCurrent()
        vm.dismissError()
        runCurrent()
        assertNull(vm.state.value.error)

        vm.rate(vm.state.value.ratings.first(), "4")
        runCurrent()
        assertEquals(InboxError.RateFailed, vm.state.value.error)
        vm.refresh()
        runCurrent()
        assertNull(vm.state.value.error)
        vm.close()
    }

    @Test
    fun `an option outside the scale writes nothing`() = runTest {
        val data = data()
        val vm = viewModel(data)

        vm.rate(vm.state.value.ratings.first(), "5")
        runCurrent()

        assertEquals(emptyList(), data.ratedEvents)
        assertEquals(2, vm.state.value.ratings.size)
        vm.close()
    }

    @Test
    fun `approving creates the event at the proposed time, then marks the request approved`() = runTest {
        val data = data()
        val vm = viewModel(data)

        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()

        assertEquals(
            listOf(
                PlannerEventDraft(
                    workspaceId = FakeInboxDataSource.WS,
                    ownerId = FakeInboxDataSource.ME,
                    title = "Jordan",
                    description = "coffee?",
                    start = TestData.request("r1").proposedStart,
                    end = TestData.request("r1").proposedEnd,
                    timeZone = "Europe/Berlin",
                ),
            ),
            data.created,
        )
        assertEquals(listOf("r1"), data.approved)
        assertEquals(emptyList(), vm.state.value.requests)
        vm.close()
    }

    @Test
    fun `an anonymous request's event gets the default title`() = runTest {
        val data = data().apply { serverRequests = listOf(TestData.request("r2", name = null, message = null)) }
        val vm = viewModel(data)

        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()

        assertEquals("Requested time", data.created.single().title)
        assertNull(data.created.single().description)
        vm.close()
    }

    @Test
    fun `when the event can't be created the request stays pending`() = runTest {
        val data = data().apply { failCreate = IOException("offline") }
        val vm = viewModel(data)

        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()

        assertEquals(emptyList(), data.approved)
        assertEquals(listOf("request:r1"), vm.state.value.requests.map { it.id })
        assertEquals(InboxError.RequestFailed, vm.state.value.error)
        vm.close()
    }

    @Test
    fun `retrying an approval whose mark failed doesn't create a second event`() = runTest {
        val data = data().apply { failApprove = IOException("offline") }
        val vm = viewModel(data)

        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()
        assertEquals(1, data.created.size)
        assertEquals(listOf("request:r1"), vm.state.value.requests.map { it.id })
        assertEquals(InboxError.RequestFailed, vm.state.value.error)

        data.failApprove = null
        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()
        assertEquals(1, data.created.size)
        assertEquals(listOf("r1"), data.approved)
        assertEquals(emptyList(), vm.state.value.requests)
        vm.close()
    }

    @Test
    fun `every attempt at an approval creates the event under the request's own id`() = runTest {
        val data = data()
        val vm = viewModel(data)

        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()

        assertEquals(listOf(InboxRules.approvedEventId("r1")), data.createCalls)
        vm.close()
    }

    @Test
    fun `leaving the screen mid-approval doesn't cut it between the event and the mark`() = runTest {
        val data = data()
        val vm = viewModel(data)
        data.hold = CompletableDeferred()

        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()
        vm.close() // Back: the ViewModel is cleared while the write is in flight

        data.hold!!.complete(Unit)
        runCurrent()
        assertEquals(1, data.created.size)
        assertEquals(listOf("r1"), data.approved)
    }

    @Test
    fun `approving again on a later visit finds the event the first visit made`() = runTest {
        val data = data().apply { failApprove = IOException("offline") }
        val first = viewModel(data)
        first.approve(first.state.value.requests.single(), "Requested time")
        runCurrent()
        assertEquals(1, data.created.size)
        first.close()

        data.failApprove = null
        val second = viewModel(data)
        second.approve(second.state.value.requests.single(), "Requested time")
        runCurrent()

        assertEquals(1, data.created.size)
        assertEquals(List(2) { InboxRules.approvedEventId("r1") }, data.createCalls)
        assertEquals(listOf("r1"), data.approved)
        assertEquals(emptyList(), second.state.value.requests)
        second.close()
    }

    @Test
    fun `an event whose insert landed but whose answer was lost isn't made twice`() = runTest {
        val data = data().apply { lostCreateAnswer = IOException("timeout") }
        val vm = viewModel(data)

        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()
        assertEquals(listOf("request:r1"), vm.state.value.requests.map { it.id })
        assertEquals(InboxError.RequestFailed, vm.state.value.error)

        data.lostCreateAnswer = null
        vm.approve(vm.state.value.requests.single(), "Requested time")
        runCurrent()
        assertEquals(1, data.created.size)
        assertEquals(listOf("r1"), data.approved)
        vm.close()
    }

    @Test
    fun `declining hides the request at once and rolls back on failure`() = runTest {
        val data = data()
        val vm = viewModel(data)
        data.hold = CompletableDeferred()
        data.failDecline = IOException("offline")

        vm.decline(vm.state.value.requests.single())
        runCurrent()
        assertEquals(emptyList(), vm.state.value.requests) // optimistic

        data.hold!!.complete(Unit)
        runCurrent()
        assertEquals(listOf("request:r1"), vm.state.value.requests.map { it.id })
        assertEquals(InboxError.RequestFailed, vm.state.value.error)

        data.failDecline = null
        vm.decline(vm.state.value.requests.single())
        runCurrent()
        assertEquals(listOf("r1"), data.declined)
        assertEquals(emptyList(), vm.state.value.requests)
        vm.close()
    }

    @Test
    fun `an unlogged night opens the rating sheet and saving it clears the row`() = runTest {
        val data = data()
        val vm = viewModel(data)

        vm.openNight(vm.state.value.nights.first { it.date == oct5 })
        val sheet = assertNotNull(vm.state.value.sheet)
        assertEquals(oct5, sheet.form.date)

        vm.updateDraft(SleepRatingDraft(bedtimeMinutes = 23 * 60, wakeMinutes = 7 * 60, quality = 6, timesEdited = true))
        vm.saveSleep()
        runCurrent()

        assertEquals(6, data.savedSleep.single().quality)
        assertEquals(oct5, data.savedSleep.single().date)
        assertNull(vm.state.value.sheet)
        assertEquals(listOf(oct6), vm.state.value.nights.map { it.date })
        vm.close()
    }

    @Test
    fun `a night saved with times only still leaves`() = runTest {
        val data = data()
        val vm = viewModel(data)

        vm.openNight(vm.state.value.nights.first { it.date == oct6 })
        vm.saveSleep()
        runCurrent()

        assertEquals(listOf(oct5), vm.state.value.nights.map { it.date })
        vm.close()
    }

    @Test
    fun `a failed sleep save keeps the sheet open to retry`() = runTest {
        val data = data().apply { failSave = IOException("offline") }
        val vm = viewModel(data)

        vm.openNight(vm.state.value.nights.first())
        vm.updateDraft(SleepRatingDraft(bedtimeMinutes = 23 * 60, wakeMinutes = 7 * 60, quality = 4))
        vm.saveSleep()
        runCurrent()

        val sheet = assertNotNull(vm.state.value.sheet)
        assertTrue(sheet.failed)
        assertFalse(sheet.saving)
        assertEquals(2, vm.state.value.nights.size)
        vm.close()
    }

    @Test
    fun `times out of order are caught before anything is sent`() = runTest {
        val data = data()
        val vm = viewModel(data)

        vm.openNight(vm.state.value.nights.first())
        vm.updateDraft(SleepRatingDraft(bedtimeMinutes = 2 * 60, wakeMinutes = 1 * 60, quality = 4, timesEdited = true))
        vm.saveSleep()
        runCurrent()

        assertTrue(assertNotNull(vm.state.value.sheet).timesOutOfOrder)
        assertEquals(emptyList(), data.savedSleep)
        vm.close()
    }

    @Test
    fun `a request resolved elsewhere leaves on the next read`() = runTest {
        val data = data()
        val vm = viewModel(data)
        assertEquals(5, vm.state.value.count)

        data.serverRequests = emptyList()
        vm.refresh()
        runCurrent()

        assertEquals(listOf("rate-event:ev", "rate-task:tk", "log-sleep:2026-10-06", "log-sleep:2026-10-05"), vm.state.value.ids())
        vm.close()
    }
}
