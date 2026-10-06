package page.planr.android.feature.agenda.detail

import androidx.lifecycle.viewModelScope
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.data.model.OverridePrior
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.OverrideType
import page.planr.android.core.recurrence.DefaultRecurrenceExpander
import page.planr.android.core.recurrence.PatchField
import page.planr.android.feature.agenda.FakeAgendaDataSource
import page.planr.android.feature.agenda.FakeAgendaDataSource.Call
import page.planr.android.feature.agenda.Fixtures
import page.planr.android.feature.agenda.MainDispatcherRule
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.Ownership
import page.planr.android.feature.agenda.model.RecurrenceScope
import page.planr.android.feature.agenda.model.UiText

@OptIn(ExperimentalCoroutinesApi::class)
class EventDetailViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val data = FakeAgendaDataSource()
    private val notices = AgendaNotices()
    private val series = Fixtures.event(
        id = "series",
        start = "2026-10-01T07:00:00Z",
        end = "2026-10-01T07:15:00Z",
        rrule = "FREQ=DAILY",
    )
    private val monday = Instant.parse("2026-10-05T07:00:00Z")

    private class Harness(
        val vm: EventDetailViewModel,
        val closed: List<Unit>,
        val posted: List<AgendaNotice>,
        val failed: List<Unit>,
    )

    private fun TestScope.open(ref: String): Harness {
        val vm = EventDetailViewModel(ref, data, DefaultRecurrenceExpander, notices)
        val closed = mutableListOf<Unit>()
        val posted = mutableListOf<AgendaNotice>()
        val failed = mutableListOf<Unit>()
        backgroundScope.launch { vm.state.collect {} }
        backgroundScope.launch { vm.closed.toList(closed) }
        backgroundScope.launch { vm.failed.toList(failed) }
        backgroundScope.launch { notices.notices.toList(posted) }
        runCurrent()
        return Harness(vm, closed, posted, failed)
    }

    private fun Harness.ready(): EventDetail = assertIs<EventDetailUiState.Ready>(vm.state.value).detail

    @Test
    fun `shows the addressed instance with its owner and series rule`() = runTest {
        data.events.value = listOf(series)
        val h = open(Occurrence.recurringKey("series", monday))

        val detail = h.ready()
        assertEquals(monday, detail.occurrence.start)
        assertEquals("Anna", detail.ownerName)
        assertTrue(detail.isOwn)
        assertTrue(detail.canEdit)
        assertTrue(detail.recurrence != null)
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `a modified instance shows its edits`() = runTest {
        data.events.value = listOf(series)
        data.overrides.value = listOf(
            EventOverride(
                id = "ov",
                workspaceId = Fixtures.WORKSPACE,
                eventId = "series",
                occurrenceDate = monday,
                type = OverrideType.Modify,
                title = "Moved standup",
            ),
        )
        val h = open(Occurrence.recurringKey("series", monday))

        assertEquals("Moved standup", h.ready().occurrence.title)
        assertTrue(h.ready().occurrence.isException)
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `the partner's personal event is read-only`() = runTest {
        data.events.value = listOf(Fixtures.event(id = "theirs", owner = Fixtures.BORIS))
        val h = open("theirs")

        assertEquals(Ownership.Theirs, h.ready().block.ownership)
        assertFalse(h.ready().canEdit)
        h.vm.delete()
        runCurrent()
        assertTrue(data.calls.isEmpty())
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `an unknown or cancelled instance is missing`() = runTest {
        data.events.value = listOf(series)
        data.overrides.value = listOf(
            EventOverride(id = "ov", workspaceId = Fixtures.WORKSPACE, eventId = "series", occurrenceDate = monday, type = OverrideType.Cancel),
        )
        val h = open(Occurrence.recurringKey("series", monday))
        assertEquals(EventDetailUiState.Missing, h.vm.state.value)
        // Opened from a widget before the cache had it: the window around it is fetched.
        val gone = open(Occurrence.recurringKey("nope", monday))
        assertEquals(EventDetailUiState.Missing, gone.vm.state.value)
        assertTrue(data.refreshedWindows.any { monday in it.start..it.end })
        h.vm.viewModelScope.cancel()
        gone.vm.viewModelScope.cancel()
    }

    @Test
    fun `deleting a single event offers an undo that restores it`() = runTest {
        data.events.value = listOf(Fixtures.event(id = "one"))
        val h = open("one")

        h.vm.delete()
        runCurrent()

        assertEquals(Call.Delete("one"), data.calls.single())
        assertEquals(1, h.closed.size)
        assertTrue(h.failed.isEmpty())
        val notice = h.posted.single()
        assertEquals(UiText(R.string.agenda_toast_event_deleted), notice.message)
        notice.undo!!.invoke()
        assertIs<Call.Restore>(data.calls.last())
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `deleting this instance cancels just that occurrence`() = runTest {
        data.events.value = listOf(series)
        val h = open(Occurrence.recurringKey("series", monday))

        h.vm.delete(RecurrenceScope.This)
        runCurrent()

        val input = assertIs<Call.Override>(data.calls.single()).input
        assertEquals(OverrideType.Cancel, input.type)
        assertEquals(monday, input.occurrenceDate)
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `deleting this instance offers no undo when the override it replaced is unknown`() = runTest {
        data.events.value = listOf(series)
        data.overridePrior = OverridePrior.Unknown
        val h = open(Occurrence.recurringKey("series", monday))

        h.vm.delete(RecurrenceScope.This)
        runCurrent()

        assertIs<Call.Override>(data.calls.single())
        assertEquals(UiText(R.string.agenda_toast_event_deleted), h.posted.single().message)
        assertNull(h.posted.single().undo)
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `deleting this and following caps the series and undo restores the rule`() = runTest {
        data.events.value = listOf(series)
        val h = open(Occurrence.recurringKey("series", monday))

        h.vm.delete(RecurrenceScope.Following)
        runCurrent()

        assertEquals(Call.CapFuture(series, monday), data.calls.single())
        assertEquals(UiText(R.string.agenda_toast_this_and_future_deleted), h.posted.single().message)
        h.posted.single().undo!!.invoke()
        val restore = assertIs<Call.Update>(data.calls.last())
        assertEquals(PatchField.Value("FREQ=DAILY"), restore.patch.rrule)
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `deleting all events deletes the series row`() = runTest {
        data.events.value = listOf(series)
        val h = open(Occurrence.recurringKey("series", monday))

        h.vm.delete(RecurrenceScope.All)
        runCurrent()

        assertEquals(Call.Delete("series"), data.calls.single())
        assertEquals(UiText(R.string.agenda_toast_series_deleted), h.posted.single().message)
        assertIs<EventDetailUiState.Ready>(h.vm.state.value, "no 'not found' flash while closing")
        h.vm.viewModelScope.cancel()
    }

    @Test
    fun `a failed delete stays open and says so`() = runTest {
        data.events.value = listOf(Fixtures.event(id = "one"))
        val h = open("one")
        data.failNext = IllegalStateException("offline")

        h.vm.delete()
        runCurrent()

        assertTrue(h.closed.isEmpty())
        assertEquals(1, h.failed.size)
        assertEquals(UiText(R.string.agenda_something_went_wrong), h.posted.single().message)
        assertFalse(h.vm.deleting.value)
        h.vm.viewModelScope.cancel()
    }
}
