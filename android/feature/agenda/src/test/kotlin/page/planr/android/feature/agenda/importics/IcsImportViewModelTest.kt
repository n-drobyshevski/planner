package page.planr.android.feature.agenda.importics

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.feature.agenda.FakeAgendaDataSource
import page.planr.android.feature.agenda.FakeAgendaDataSource.Call
import page.planr.android.feature.agenda.Fixtures
import page.planr.android.feature.agenda.MainDispatcherRule
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.edit.VisibilityChoice
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.UiText

@OptIn(ExperimentalCoroutinesApi::class)
class IcsImportViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val data = FakeAgendaDataSource()
    private val notices = AgendaNotices()
    private val requests = IcsImportRequests()
    private val clock = Fixtures.clockAt("2026-10-04T07:10:00Z")

    private val file = """
        BEGIN:VCALENDAR
        BEGIN:VEVENT
        UID:standup
        DTSTART;TZID=Europe/Berlin:20261005T090000
        DTEND;TZID=Europe/Berlin:20261005T093000
        RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4
        EXDATE;TZID=Europe/Berlin:20261012T090000
        SUMMARY:Standup
        END:VEVENT
        BEGIN:VEVENT
        UID:dentist
        DTSTART:20261007T170000Z
        DTEND:20261007T180000Z
        SUMMARY:Dentist
        END:VEVENT
        BEGIN:VEVENT
        UID:old
        DTSTART:20260901T100000Z
        DTEND:20260901T110000Z
        SUMMARY:Last month
        END:VEVENT
        BEGIN:VEVENT
        UID:budget
        DTSTART:20261009T100000Z
        DTEND:20261009T110000Z
        SUMMARY:Budget
        STATUS:CANCELLED
        END:VEVENT
        BEGIN:VEVENT
        UID:trip
        DTSTART;VALUE=DATE:20261031
        DTEND;VALUE=DATE:20261102
        SUMMARY:Trip
        END:VEVENT
        END:VCALENDAR
    """.trimIndent().replace("\n", "\r\n")

    /** Already in Planr under the same UID (other title and time). */
    private val existingDentist = Fixtures.event(id = "existing", title = "Other")
        .copy(attributes = buildJsonObject { put("icalUid", "dentist") })

    init {
        data.importCandidates = listOf(existingDentist)
    }

    private fun TestScope.viewModel(text: String? = file): Pair<IcsImportViewModel, List<IcsImportEffect>> {
        text?.let(requests::offer)
        val vm = IcsImportViewModel(requests, data, notices, clock, main.dispatcher)
        val effects = mutableListOf<IcsImportEffect>()
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

    private fun IcsImportViewModel.row(key: String) = state.value.rows.first { it.key == key }

    @Test
    fun `duplicates, cancelled and past events start unticked, and the range starts today`() = runTest {
        val (vm, _) = viewModel()
        val s = vm.state.value

        assertEquals(IcsImportUiState.Phase.Ready, s.phase)
        assertEquals(listOf("old", "standup", "dentist", "budget", "trip"), s.rows.map { it.key })
        assertEquals(listOf(false, true, false, false, true), s.rows.map { it.selected })
        assertTrue(vm.row("dentist").duplicate)
        assertEquals(LocalDate(2026, 10, 4), s.from)
        assertEquals(listOf("standup", "dentist", "budget", "trip"), s.visible.map { it.key })
        assertEquals(listOf("standup", "trip"), s.toImport.map { it.key })
        assertEquals("Europe/Berlin", s.zone)
        // Shared contexts and the viewer's own; Boris has none here.
        assertEquals(listOf(Fixtures.work, Fixtures.home), s.categories)

        val lookup = data.calls.filterIsInstance<Call.FindImportCandidates>().single()
        assertEquals(setOf("standup", "dentist", "old", "budget", "trip"), lookup.uids)
        assertEquals(
            TimeWindow(Instant.parse("2026-09-01T10:00:00Z"), Instant.parse("2026-11-02T00:00:00.001Z")),
            lookup.window,
        )
    }

    @Test
    fun `the file is claimed once, and nothing pending shows that there is nothing to import`() = runTest {
        viewModel()
        val (second, _) = viewModel(text = null)
        assertEquals(IcsImportUiState.Phase.NoFile, second.state.value.phase)
    }

    @Test
    fun `a file without events says so`() = runTest {
        val (vm, _) = viewModel("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:No start\r\nEND:VEVENT\r\nEND:VCALENDAR")
        assertEquals(IcsImportUiState.Phase.Empty, vm.state.value.phase)
        assertEquals(1, vm.state.value.skipped)
    }

    @Test
    fun `import creates the selected rows with their uid, then cancels the series' exdates, with one undo`() = runTest {
        val posted = postedNotices()
        val (vm, effects) = viewModel()

        vm.import()
        runCurrent()

        assertEquals(listOf(IcsImportEffect.Done), effects)
        val drafts = data.calls.filterIsInstance<Call.CreateMany>().single().drafts
        assertEquals(listOf("Standup", "Trip"), drafts.map { it.title })
        val standup = drafts[0]
        assertEquals(Instant.parse("2026-10-05T07:00:00Z"), standup.start)
        assertEquals(Instant.parse("2026-10-05T07:30:00Z"), standup.end)
        assertEquals("Europe/Berlin", standup.timeZone)
        assertEquals("FREQ=WEEKLY;BYDAY=MO;COUNT=4", standup.rrule)
        assertEquals(JsonPrimitive("standup"), standup.attributes["icalUid"])
        assertEquals(Fixtures.ANNA, standup.ownerId)
        assertEquals(Fixtures.WORKSPACE, standup.workspaceId)
        assertFalse(standup.isPrivate)
        assertFalse(standup.isShared)
        val trip = drafts[1]
        assertTrue(trip.allDay)
        assertEquals(Instant.parse("2026-10-31T00:00:00Z"), trip.start)
        assertEquals(Instant.parse("2026-11-02T00:00:00Z"), trip.end)

        val cancels = data.calls.filterIsInstance<Call.CancelMany>().single().inputs
        assertEquals(listOf(EditSemantics.cancelOccurrence("imported-0", Instant.parse("2026-10-12T07:00:00Z"))), cancels)

        val notice = posted.single()
        assertEquals(UiText(R.plurals.agenda_import_done, listOf(2), quantity = 2), notice.message)
        notice.undo!!.invoke()
        assertEquals(Call.DeleteMany(listOf("imported-0", "imported-1")), data.calls.last())
    }

    @Test
    fun `one context and sharing apply to every event, and a shared context stores clean flags`() = runTest {
        val (vm, _) = viewModel()

        vm.setCategory(Fixtures.work.id)
        vm.setVisibility(VisibilityChoice.Private)
        assertFalse(vm.state.value.sharedContext)
        vm.import()
        runCurrent()
        val personal = data.calls.filterIsInstance<Call.CreateMany>().single().drafts
        assertTrue(personal.all { it.categoryId == Fixtures.work.id && it.isPrivate && !it.isShared })

        val (shared, _) = viewModel()
        shared.setCategory(Fixtures.home.id)
        shared.setVisibility(VisibilityChoice.Private)
        assertTrue(shared.state.value.sharedContext)
        shared.import()
        runCurrent()
        val joint = data.calls.filterIsInstance<Call.CreateMany>().last().drafts
        assertTrue(joint.all { it.categoryId == Fixtures.home.id && !it.isPrivate && !it.isShared })
    }

    @Test
    fun `filters narrow the rows, and select all or none applies to the kept ones`() = runTest {
        val (vm, _) = viewModel()

        vm.setFrom(null)
        assertEquals(5, vm.state.value.visible.size)
        vm.setNameFilter("/^(standup|last)/")
        assertEquals(listOf("old", "standup"), vm.state.value.visible.map { it.key })
        vm.selectAll(true)
        assertEquals(listOf(true, true, false, false, true), vm.state.value.rows.map { it.selected })
        vm.selectAll(false)
        assertEquals(listOf(false, false, false, false, true), vm.state.value.rows.map { it.selected })

        vm.setNameFilter("/[oops/")
        assertTrue(vm.state.value.nameFilterInvalid)
        assertEquals(5, vm.state.value.visible.size, "an invalid regex filters nothing")

        vm.setNameFilter("tr?p")
        vm.setTo(LocalDate(2026, 10, 30))
        assertEquals(emptyList(), vm.state.value.visible)
        vm.setTo(LocalDate(2026, 10, 31))
        assertEquals(listOf("trip"), vm.state.value.visible.map { it.key })
    }

    @Test
    fun `an edited row imports its new times and moves its exdates along`() = runTest {
        val (vm, _) = viewModel()

        vm.expand("standup")
        vm.edit("standup") { it.withStart(time = LocalTime(10, 0)).copy(title = "Standup (late)") }
        val row = vm.row("standup")
        assertTrue(row.edited)
        assertEquals("standup", vm.state.value.expandedKey)
        vm.import()
        runCurrent()

        val draft = data.calls.filterIsInstance<Call.CreateMany>().single().drafts.first()
        assertEquals("Standup (late)", draft.title)
        assertEquals(Instant.parse("2026-10-05T08:00:00Z"), draft.start)
        assertEquals(Instant.parse("2026-10-05T08:30:00Z"), draft.end)
        assertEquals("FREQ=WEEKLY;BYDAY=MO;COUNT=4", draft.rrule)
        val cancel = data.calls.filterIsInstance<Call.CancelMany>().single().inputs.single()
        assertEquals(Instant.parse("2026-10-12T08:00:00Z"), cancel.occurrenceDate)

        vm.resetEdits("standup")
        assertFalse(vm.row("standup").edited)
    }

    @Test
    fun `an edit that ends before it starts blocks the import and opens that row`() = runTest {
        val (vm, _) = viewModel()
        vm.edit("trip") { it.copy(endDate = LocalDate(2026, 10, 1)) }
        assertNotNull(vm.row("trip").error)

        vm.import()
        runCurrent()

        assertEquals("trip", vm.state.value.expandedKey)
        assertTrue(data.calls.none { it is Call.CreateMany })
    }

    @Test
    fun `when the cancellations fail, the created events are deleted again and the review stays`() = runTest {
        val posted = postedNotices()
        data.failWhen = { call -> if (call is Call.CancelMany) IllegalStateException("offline") else null }
        val (vm, effects) = viewModel()

        vm.import()
        runCurrent()

        assertEquals(listOf(IcsImportEffect.Failed), effects)
        assertEquals(Call.DeleteMany(listOf("imported-0", "imported-1")), data.calls.last())
        assertTrue(posted.isEmpty())
        assertFalse(vm.state.value.importing)
    }

    @Test
    fun `a failed duplicate lookup still reviews the file, without duplicates`() = runTest {
        data.failNext = IllegalStateException("offline")
        val (vm, _) = viewModel()

        assertEquals(IcsImportUiState.Phase.Ready, vm.state.value.phase)
        assertTrue(vm.state.value.duplicatesUnknown)
        assertTrue(vm.state.value.rows.none { it.duplicate })
    }
}
