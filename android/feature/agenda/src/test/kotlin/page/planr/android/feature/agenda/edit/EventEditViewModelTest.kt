package page.planr.android.feature.agenda.edit

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
import kotlinx.datetime.LocalTime
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.OverrideType
import page.planr.android.core.recurrence.DefaultRecurrenceExpander
import page.planr.android.core.recurrence.Freq
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.recurrence.RecurrenceForm
import page.planr.android.feature.agenda.EventEditTarget
import page.planr.android.feature.agenda.FakeAgendaDataSource
import page.planr.android.feature.agenda.FakeAgendaDataSource.Call
import page.planr.android.feature.agenda.Fixtures
import page.planr.android.feature.agenda.MainDispatcherRule
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.RecurrenceScope
import page.planr.android.feature.agenda.model.UiText

@OptIn(ExperimentalCoroutinesApi::class)
class EventEditViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val data = FakeAgendaDataSource()
    private val notices = AgendaNotices()
    private val clock = Fixtures.clockAt("2026-10-04T07:10:00Z")

    private val series = Fixtures.event(
        id = "series",
        title = "Standup",
        start = "2026-10-01T07:00:00Z",
        end = "2026-10-01T07:15:00Z",
        rrule = "FREQ=DAILY",
    )

    /** The Monday instance of [series] (09:00 Berlin). */
    private val monday = Instant.parse("2026-10-05T07:00:00Z")

    private fun TestScope.viewModel(target: EventEditTarget): Pair<EventEditViewModel, List<EventEditEffect>> {
        val vm = EventEditViewModel(target, data, DefaultRecurrenceExpander, notices, clock)
        val effects = mutableListOf<EventEditEffect>()
        backgroundScope.launch { vm.effects.toList(effects) }
        runCurrent()
        return vm to effects
    }

    private fun TestScope.postedNotices(): List<AgendaNotice> {
        val out = mutableListOf<AgendaNotice>()
        backgroundScope.launch { notices.notices.toList(out) }
        runCurrent()
        return out
    }

    @Test
    fun `a new event starts at the next half hour in the member's zone`() = runTest {
        val (vm, _) = viewModel(EventEditTarget.New())
        val form = vm.state.value.form!!

        assertEquals(LocalTime(9, 30), form.startTime)
        assertEquals(LocalTime(10, 30), form.endTime)
        assertEquals(Fixtures.ZONE, form.timeZone)
        // Only shared contexts and the viewer's own are offered.
        assertEquals(setOf(Fixtures.work.id, Fixtures.home.id), vm.state.value.categories.map { it.id }.toSet())
        vm.viewModelScope.cancel()
    }

    @Test
    fun `creating validates, then inserts the member's event and confirms`() = runTest {
        val (vm, effects) = viewModel(EventEditTarget.New(Instant.parse("2026-10-06T16:00:00Z")))
        val posted = postedNotices()

        vm.save()
        assertEquals(EventFormError.TitleRequired, vm.state.value.error)
        assertTrue(data.calls.isEmpty())

        vm.update { it.copy(title = "  Dinner ", visibility = VisibilityChoice.Private, recurrence = RecurrenceForm(Freq.WEEKLY)) }
        assertNull(vm.state.value.error, "fixing the form clears the error")
        vm.save()
        runCurrent()

        val draft = assertIs<Call.Create>(data.calls.single()).draft
        assertEquals("Dinner", draft.title)
        assertEquals(Fixtures.ANNA, draft.ownerId)
        assertEquals(Fixtures.WORKSPACE, draft.workspaceId)
        assertEquals(Instant.parse("2026-10-06T16:00:00Z"), draft.start)
        assertEquals(Instant.parse("2026-10-06T17:00:00Z"), draft.end)
        assertEquals(Fixtures.ZONE, draft.timeZone)
        assertEquals("FREQ=WEEKLY", draft.rrule)
        assertTrue(draft.isPrivate)
        assertFalse(draft.isShared)
        assertEquals(listOf<EventEditEffect>(EventEditEffect.Done), effects)
        assertEquals(UiText(R.string.agenda_toast_event_created), posted.single().message)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `a shared context makes the event joint through the context`() = runTest {
        val (vm, _) = viewModel(EventEditTarget.New())
        vm.update { it.copy(title = "Groceries", categoryId = Fixtures.home.id, visibility = VisibilityChoice.Shared) }
        assertTrue(vm.state.value.sharedContext)

        vm.save()
        runCurrent()

        val draft = assertIs<Call.Create>(data.calls.single()).draft
        assertFalse(draft.isShared)
        assertFalse(draft.isPrivate)
        assertEquals(Fixtures.home.id, draft.categoryId)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `editing a single event writes the row with the updated_at guard`() = runTest {
        val single = Fixtures.event(id = "one")
        data.events.value = listOf(single)
        val (vm, effects) = viewModel(EventEditTarget.Existing("one"))
        assertFalse(vm.state.value.isRecurringEdit)

        vm.update { it.copy(title = "Retro") }
        vm.save()
        runCurrent()

        val update = assertIs<Call.Update>(data.calls.single())
        assertEquals("one", update.id)
        assertEquals(Fixtures.updated, update.expectedUpdatedAt)
        assertEquals(PatchField.Value("Retro"), update.patch.title)
        assertEquals(PatchField.Unchanged, update.patch.rrule, "an untouched rule is not rewritten")
        assertEquals(PatchField.Unchanged, update.patch.timeZone)
        assertEquals(listOf<EventEditEffect>(EventEditEffect.Done), effects)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `a stale write keeps the form and offers a reload`() = runTest {
        data.events.value = listOf(Fixtures.event(id = "one", title = "Standup"))
        val (vm, effects) = viewModel(EventEditTarget.Existing("one"))
        vm.update { it.copy(title = "Mine") }
        data.failNext = StaleWriteException(SupabaseTables.EVENTS, "one")

        vm.save()
        runCurrent()

        assertEquals(listOf<EventEditEffect>(EventEditEffect.Stale), effects)
        assertEquals("Mine", vm.state.value.form?.title)
        assertFalse(vm.state.value.saving)

        // Someone else's version landed in the cache; reloading shows it.
        data.events.value = listOf(Fixtures.event(id = "one", title = "Theirs"))
        vm.reloadLatest()
        runCurrent()
        assertEquals("Theirs", vm.state.value.form?.title)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `other failures keep the form too`() = runTest {
        val (vm, effects) = viewModel(EventEditTarget.New())
        vm.update { it.copy(title = "Offline") }
        data.failNext = IllegalStateException("network")

        vm.save()
        runCurrent()

        assertEquals(listOf<EventEditEffect>(EventEditEffect.Failed), effects)
        assertEquals("Offline", vm.state.value.form?.title)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `saving a series instance asks for the scope first`() = runTest {
        data.events.value = listOf(series)
        val (vm, _) = viewModel(EventEditTarget.Existing(Occurrence.recurringKey("series", monday)))
        assertTrue(vm.state.value.isRecurringEdit)
        assertEquals(LocalTime(9, 0), vm.state.value.form?.startTime)

        vm.update { it.copy(title = "Planning") }
        vm.save()

        assertTrue(vm.state.value.askScope)
        assertTrue(data.calls.isEmpty())
        vm.dismissScope()
        assertFalse(vm.state.value.askScope)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `this event becomes a modify override keyed on the original start`() = runTest {
        data.events.value = listOf(series)
        val (vm, effects) = viewModel(EventEditTarget.Existing(Occurrence.recurringKey("series", monday)))
        val posted = postedNotices()
        vm.update { it.withStart(time = LocalTime(10, 0)).copy(title = "Planning") }

        vm.save()
        vm.chooseScope(RecurrenceScope.This)
        runCurrent()

        val input = assertIs<Call.Override>(data.calls.single()).input
        assertEquals(OverrideType.Modify, input.type)
        assertEquals(monday, input.occurrenceDate)
        assertEquals("Planning", input.patch?.title)
        assertEquals(Instant.parse("2026-10-05T08:00:00Z"), input.patch?.start)
        assertEquals(Instant.parse("2026-10-05T08:15:00Z"), input.patch?.end)
        assertEquals(listOf<EventEditEffect>(EventEditEffect.Done), effects)

        // Its Undo reverts the override.
        posted.single().undo!!.invoke()
        assertIs<Call.Revert>(data.calls.last())
        vm.viewModelScope.cancel()
    }

    @Test
    fun `this and following splits the series at the instance`() = runTest {
        data.events.value = listOf(series)
        val (vm, _) = viewModel(EventEditTarget.Existing(Occurrence.recurringKey("series", monday)))
        vm.update { it.copy(title = "Planning") }

        vm.save()
        vm.chooseScope(RecurrenceScope.Following)
        runCurrent()

        val split = assertIs<Call.Split>(data.calls.single())
        assertEquals(monday, split.from)
        assertEquals("Planning", split.patch.title)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `all events moves the master by the instance's shift and keeps the guard`() = runTest {
        data.events.value = listOf(series)
        val (vm, _) = viewModel(EventEditTarget.Existing(Occurrence.recurringKey("series", monday)))
        // 09:00–09:15 → 09:30–10:00: series start moves 30 min, duration becomes 30 min.
        vm.update { it.copy(startTime = LocalTime(9, 30), endTime = LocalTime(10, 0)) }

        vm.save()
        vm.chooseScope(RecurrenceScope.All)
        runCurrent()

        val update = assertIs<Call.Update>(data.calls.single())
        assertEquals("series", update.id)
        assertEquals(Fixtures.updated, update.expectedUpdatedAt)
        assertEquals(PatchField.Value(Instant.parse("2026-10-01T07:30:00Z")), update.patch.start)
        assertEquals(PatchField.Value(Instant.parse("2026-10-01T08:00:00Z")), update.patch.end)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `a ref to a missing event says so`() = runTest {
        val (vm, _) = viewModel(EventEditTarget.Existing("gone"))
        assertEquals(EventEditUiState.Phase.Missing, vm.state.value.phase)
        vm.viewModelScope.cancel()
    }
}
