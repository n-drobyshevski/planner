package page.planr.android.feature.agenda

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.model.TimeWindow
import page.planr.android.feature.agenda.model.AgendaDayRequests
import page.planr.android.feature.agenda.model.AgendaMode
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.Ownership
import page.planr.android.feature.agenda.model.UiText

@OptIn(ExperimentalCoroutinesApi::class)
class AgendaViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val data = FakeAgendaDataSource()
    private val notices = AgendaNotices()
    private val dayRequests = AgendaDayRequests()

    // Sunday 4 Oct 2026, 09:30 in Berlin.
    private val clock = Fixtures.clockAt("2026-10-04T07:30:00Z")
    private val sunday = LocalDate(2026, 10, 4)

    private fun TestScope.viewModel(saved: SavedStateHandle = SavedStateHandle()): AgendaViewModel {
        val vm = AgendaViewModel(data, clock, notices, saved, dayRequests)
        backgroundScope.launch { vm.state.collect {} }
        runCurrent()
        return vm
    }

    private fun AgendaViewModel.close() = viewModelScope.cancel()

    @Test
    fun `opens on today's day in the member's zone and loads around it`() = runTest {
        val vm = viewModel()
        val state = vm.state.value

        assertEquals(AgendaMode.Day, state.mode)
        assertEquals(sunday, state.today)
        assertEquals(listOf(sunday), state.days)
        assertEquals(0, state.periodOffset)
        assertTrue(state.isLoaded)
        assertTrue(state.canCreate)
        val expected = TimeWindow(Instant.parse("2026-10-02T22:00:00Z"), Instant.parse("2026-10-05T22:00:00Z"))
        assertEquals(expected, data.observedWindows.last())
        assertEquals(expected, data.refreshedWindows.last())
        assertEquals(1, data.workspaceRefreshes)
        vm.close()
    }

    @Test
    fun `arrows and today move between periods`() = runTest {
        val vm = viewModel()

        vm.next()
        assertEquals(listOf(LocalDate(2026, 10, 5)), vm.state.value.days)
        assertEquals(1, vm.state.value.periodOffset)

        vm.previous()
        vm.previous()
        assertEquals(LocalDate(2026, 10, 3), vm.state.value.focusDate)

        vm.goToToday()
        assertEquals(0, vm.state.value.periodOffset)
        assertEquals(sunday, vm.state.value.focusDate)
        vm.close()
    }

    @Test
    fun `week mode shows Monday to Sunday and swipes by weeks`() = runTest {
        val vm = viewModel()

        vm.setMode(AgendaMode.Week)
        assertEquals(LocalDate(2026, 9, 28), vm.state.value.days.first())
        assertEquals(sunday, vm.state.value.days.last())
        assertEquals(Instant.parse("2026-09-20T22:00:00Z"), data.observedWindows.last().start)

        vm.showPeriod(1)
        assertEquals(LocalDate(2026, 10, 5), vm.state.value.days.first())

        // Opening a day from the week header switches to that day.
        vm.openDay(LocalDate(2026, 10, 7))
        assertEquals(AgendaMode.Day, vm.state.value.mode)
        assertEquals(listOf(LocalDate(2026, 10, 7)), vm.state.value.days)
        vm.close()
    }

    @Test
    fun `opening another day of today's week lands on that day, not today`() = runTest {
        val vm = viewModel()
        vm.setMode(AgendaMode.Week)
        runCurrent()

        vm.openDay(LocalDate(2026, 10, 1))
        assertEquals(AgendaMode.Day, vm.state.value.mode)
        assertEquals(listOf(LocalDate(2026, 10, 1)), vm.state.value.days)
        vm.close()
    }

    @Test
    fun `a widget's day request opens that day, once, live or on creation`() = runTest {
        // Posted before the agenda exists (a cold start from the widget).
        dayRequests.request(LocalDate(2026, 10, 9))
        val vm = viewModel()
        assertEquals(AgendaMode.Day, vm.state.value.mode)
        assertEquals(listOf(LocalDate(2026, 10, 9)), vm.state.value.days)

        // Taken: a second agenda doesn't replay it.
        val other = viewModel()
        assertEquals(listOf(sunday), other.state.value.days)
        other.close()

        // Posted while the agenda is open.
        vm.setMode(AgendaMode.Week)
        dayRequests.request(LocalDate(2026, 10, 20))
        runCurrent()
        assertEquals(AgendaMode.Day, vm.state.value.mode)
        assertEquals(listOf(LocalDate(2026, 10, 20)), vm.state.value.days)
        vm.close()
    }

    @Test
    fun `opens in the saved mode and saves the one picked`() = runTest {
        data.agendaMode.value = AgendaMode.Week
        val vm = viewModel()
        assertEquals(AgendaMode.Week, vm.state.value.mode)
        assertEquals(7, vm.state.value.days.size)

        vm.setMode(AgendaMode.Day)
        runCurrent()
        assertEquals(AgendaMode.Day, data.agendaMode.value)
        assertEquals(AgendaMode.Day, vm.state.value.mode)

        // Opening a day from the week is a pick too.
        vm.setMode(AgendaMode.Week)
        vm.openDay(LocalDate(2026, 10, 6))
        runCurrent()
        assertEquals(AgendaMode.Day, data.agendaMode.value)
        vm.close()
    }

    @Test
    fun `follows the saved mode until one is picked here`() = runTest {
        val vm = viewModel()
        assertEquals(AgendaMode.Day, vm.state.value.mode)

        // Restored from the account after the screen opened (a fresh install's first sync).
        data.agendaMode.value = AgendaMode.Week
        runCurrent()
        assertEquals(AgendaMode.Week, vm.state.value.mode)
        vm.close()
    }

    @Test
    fun `mode and focus survive a restored saved state`() = runTest {
        val saved = SavedStateHandle()
        val first = viewModel(saved)
        first.setMode(AgendaMode.Week)
        first.next()
        first.close()

        val restored = viewModel(saved)
        assertEquals(AgendaMode.Week, restored.state.value.mode)
        assertEquals(1, restored.state.value.periodOffset)
        restored.close()
    }

    @Test
    fun `hiding the partner keeps my events and joint ones`() = runTest {
        data.events.value = listOf(
            Fixtures.event(id = "mine", owner = Fixtures.ANNA, start = "2026-10-04T08:00:00Z", end = "2026-10-04T09:00:00Z"),
            Fixtures.event(id = "theirs", owner = Fixtures.BORIS, start = "2026-10-04T10:00:00Z", end = "2026-10-04T11:00:00Z"),
            Fixtures.event(
                id = "joint",
                owner = Fixtures.BORIS,
                isShared = true,
                start = "2026-10-04T12:00:00Z",
                end = "2026-10-04T13:00:00Z",
            ),
        )
        val vm = viewModel()
        assertEquals(PartnerToggle(name = "Boris", color = "#0f766e", isMemberA = false, shown = true), vm.state.value.partner)

        vm.setShowPartnerEvents(false)
        runCurrent()
        assertEquals(false, data.showPartnerEvents.value)
        assertEquals(false, vm.state.value.partner?.shown)
        assertEquals(setOf("mine", "joint"), vm.state.value.schedule(sunday).timed.map { it.block.eventId }.toSet())

        vm.setShowPartnerEvents(true)
        runCurrent()
        assertEquals(setOf("mine", "theirs", "joint"), vm.state.value.schedule(sunday).timed.map { it.block.eventId }.toSet())
        vm.close()
    }

    @Test
    fun `no partner toggle without exactly one other member`() = runTest {
        data.members.value = listOf(Fixtures.anna)
        val vm = viewModel()
        assertEquals(null, vm.state.value.partner)
        vm.close()
    }

    @Test
    fun `both members' occurrences land on their days in their colors`() = runTest {
        data.events.value = listOf(
            Fixtures.event(id = "mine", owner = Fixtures.ANNA, start = "2026-10-04T08:00:00Z", end = "2026-10-04T09:00:00Z"),
            Fixtures.event(id = "theirs", owner = Fixtures.BORIS, start = "2026-10-04T08:30:00Z", end = "2026-10-04T09:30:00Z"),
            Fixtures.event(
                id = "daily",
                title = "Walk",
                start = "2026-10-01T16:00:00Z",
                end = "2026-10-01T16:30:00Z",
                rrule = "FREQ=DAILY",
            ),
        )
        val vm = viewModel()

        val today = vm.state.value.schedule(sunday)
        val byId = today.timed.associateBy { it.block.eventId }
        assertEquals(setOf("mine", "theirs", "daily"), byId.keys)
        assertEquals("#c0492a", byId.getValue("mine").block.color)
        assertEquals(Ownership.Mine, byId.getValue("mine").block.ownership)
        assertEquals("#0f766e", byId.getValue("theirs").block.color)
        assertEquals(Ownership.Theirs, byId.getValue("theirs").block.ownership)
        assertEquals(2, byId.getValue("mine").lanes, "overlapping events sit side by side")
        assertEquals(10 * 60, byId.getValue("mine").startMinute)
        // The recurring walk also shows on the neighbouring loaded days.
        assertEquals("daily:" + Instant.parse("2026-10-05T16:00:00Z").toEpochMilliseconds(),
            vm.state.value.schedule(LocalDate(2026, 10, 5)).timed.single().block.key)
        vm.close()
    }

    @Test
    fun `cache changes flow straight into the agenda`() = runTest {
        val vm = viewModel()
        assertTrue(vm.state.value.schedule(sunday).isEmpty)

        data.events.value = listOf(Fixtures.event(start = "2026-10-04T10:00:00Z", end = "2026-10-04T11:00:00Z"))
        runCurrent()

        assertFalse(vm.state.value.schedule(sunday).isEmpty)
        vm.close()
    }

    @Test
    fun `pull-to-refresh refetches and reports a failure calmly`() = runTest {
        val vm = viewModel()
        val messages = mutableListOf<AgendaNotice>()
        backgroundScope.launch { vm.messages.toList(messages) }

        vm.refresh()
        runCurrent()
        assertEquals(2, data.workspaceRefreshes)
        assertTrue(messages.isEmpty())
        assertFalse(vm.state.value.isRefreshing)

        data.failRefresh = IllegalStateException("offline")
        vm.refresh()
        runCurrent()
        assertEquals(UiText(R.string.agenda_refresh_failed), messages.single().message)
        assertFalse(vm.state.value.isRefreshing)
        vm.close()
    }

    @Test
    fun `undo runs the notice's action and confirms`() = runTest {
        val vm = viewModel()
        val messages = mutableListOf<AgendaNotice>()
        backgroundScope.launch { vm.messages.toList(messages) }
        var undone = false

        notices.post(AgendaNotice(UiText(R.string.agenda_toast_event_deleted)) { undone = true })
        runCurrent()
        vm.undo(messages.single())
        runCurrent()

        assertTrue(undone)
        assertEquals(UiText(R.string.agenda_toast_undone), messages.last().message)
        vm.close()
    }

    @Test
    fun `plain confirmations respect show_success_toasts, undo notices always show`() = runTest {
        data.members.value = listOf(Fixtures.anna.copy(showSuccessToasts = false), Fixtures.boris)
        val vm = viewModel()
        val messages = mutableListOf<AgendaNotice>()
        backgroundScope.launch { vm.messages.toList(messages) }

        notices.post(AgendaNotice(UiText(R.string.agenda_toast_event_updated)))
        notices.post(AgendaNotice(UiText(R.string.agenda_toast_event_deleted)) {})
        runCurrent()

        assertEquals(listOf(UiText(R.string.agenda_toast_event_deleted)), messages.map { it.message })
        vm.close()
    }
}
