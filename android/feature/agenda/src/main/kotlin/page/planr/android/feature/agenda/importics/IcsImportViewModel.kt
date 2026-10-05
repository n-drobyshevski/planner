package page.planr.android.feature.agenda.importics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import javax.inject.Qualifier
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.LocalDate
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.ical.DayRange
import page.planr.android.core.ical.IcsEvent
import page.planr.android.core.ical.IcsParser
import page.planr.android.core.ical.IcsReview
import page.planr.android.core.ical.NameFilter
import page.planr.android.core.model.Category
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.data.AgendaDataSource
import page.planr.android.feature.agenda.edit.EventForm
import page.planr.android.feature.agenda.edit.VisibilityChoice
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.UiText
import page.planr.android.feature.agenda.model.viewerZone

/** Where the import parses a file (off the main thread). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IcsImportDispatcher

/**
 * The .ics import review. Takes the pending file from [IcsImportRequests],
 * parses it in the viewer's zone (`IcsParser`), looks up which events are
 * already in Planr, and holds the review: a name filter and a day range
 * (from today by default), per-row selection (duplicates, cancelled and past
 * events start unticked), per-row edits, and one context and sharing choice
 * for every event. Import creates the kept, selected rows in bulk with their
 * EXDATEs as cancel overrides, all or nothing, and posts a notice whose Undo
 * deletes every created event.
 */
@HiltViewModel
class IcsImportViewModel @Inject constructor(
    requests: IcsImportRequests,
    private val data: AgendaDataSource,
    private val notices: AgendaNotices,
    private val clock: Clock,
    @IcsImportDispatcher private val compute: CoroutineDispatcher,
) : ViewModel() {

    private val _state = MutableStateFlow(IcsImportUiState())
    val state: StateFlow<IcsImportUiState> = _state.asStateFlow()

    private val _effects = Channel<IcsImportEffect>(Channel.BUFFERED)
    val effects: Flow<IcsImportEffect> = _effects.receiveAsFlow()

    /** Every category (the usable ones are in the state), for the shared-context rule. */
    private var allCategories: List<Category> = emptyList()

    init {
        // Claimed now, so the file is reviewed by this screen only.
        val text = requests.take()
        viewModelScope.launch { load(text) }
    }

    fun setNameFilter(pattern: String) = refilter { it.copy(nameFilter = pattern) }

    fun setFrom(date: LocalDate?) = refilter { it.copy(from = date) }

    fun setTo(date: LocalDate?) = refilter { it.copy(to = date) }

    fun toggle(key: String) = updateRow(key) { it.copy(selected = !it.selected) }

    /** Ticks or unticks every row the filters keep. */
    fun selectAll(selected: Boolean) {
        val keys = _state.value.visible.mapTo(HashSet()) { it.key }
        updateRows { row -> if (row.key in keys) row.copy(selected = selected) else row }
    }

    /** Opens [key]'s inline editor, or closes it when it is the open one. */
    fun expand(key: String) = _state.update { it.copy(expandedKey = if (it.expandedKey == key) null else key) }

    fun edit(key: String, transform: (EventForm) -> EventForm) = updateRow(key) { it.copy(form = transform(it.form)) }

    /** Puts [key] back as the file has it. */
    fun resetEdits(key: String) = updateRow(key) { it.copy(form = it.initial) }

    fun setCategory(id: String?) = _state.update { it.copy(categoryId = id) }

    fun setVisibility(choice: VisibilityChoice) = _state.update { it.copy(visibility = choice) }

    fun import() {
        val s = _state.value
        if (s.importing || s.phase != IcsImportUiState.Phase.Ready) return
        val chosen = s.toImport
        if (chosen.isEmpty()) return
        chosen.firstOrNull { it.error != null }?.let { invalid ->
            _state.update { it.copy(expandedKey = invalid.key) }
            return
        }
        val session = data.currentSession() ?: return
        val drafts = chosen.map { it.draft(session.workspaceId, session.memberId, s.categoryId, s.visibility, allCategories) }
        _state.update { it.copy(importing = true) }
        viewModelScope.launch {
            val effect = try {
                val created = data.createEvents(drafts)
                val cancels = chosen.zip(created).flatMap { (row, event) ->
                    row.exdates().map { EditSemantics.cancelOccurrence(event.id, Instant.fromEpochMilliseconds(it)) }
                }
                val ids = created.map { it.id }
                if (cancels.isNotEmpty()) {
                    try {
                        data.cancelOccurrences(cancels)
                    } catch (e: Exception) {
                        // All or nothing: a series without its cancellations would show dates the file dropped.
                        withContext(NonCancellable) { runCatching { data.deleteEvents(ids) } }
                        throw e
                    }
                }
                notices.post(
                    AgendaNotice(UiText.plural(R.plurals.agenda_import_done, created.size)) { data.deleteEvents(ids) },
                )
                IcsImportEffect.Done
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                IcsImportEffect.Failed
            }
            if (effect == IcsImportEffect.Failed) _state.update { it.copy(importing = false) }
            _effects.send(effect)
        }
    }

    private suspend fun load(text: String?) {
        if (text == null) {
            _state.update { it.copy(phase = IcsImportUiState.Phase.NoFile) }
            return
        }
        val session = data.currentSession()
        val members = data.observeMembers().first()
        allCategories = data.observeCategories().first()
        val zone = viewerZone(members.firstOrNull { it.id == session?.memberId })
        val parsed = withContext(compute) { IcsParser.parse(text, zone.id) }
        if (parsed.events.isEmpty()) {
            _state.update { it.copy(phase = IcsImportUiState.Phase.Empty, skipped = parsed.skipped, zone = zone.id) }
            return
        }

        var duplicatesUnknown = false
        val existing = try {
            data.findImportCandidates(parsed.events.mapNotNull { it.uid }.toSet(), spanOf(parsed.events))
                .map(ImportRow::existingOf)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            duplicatesUnknown = true
            emptyList()
        }
        val now = clock.now()
        val rows = parsed.events.map { event ->
            val duplicate = IcsReview.isDuplicate(event, existing)
            val form = ImportRow.formOf(event)
            ImportRow(
                event = event,
                duplicate = duplicate,
                selected = IcsReview.selectedByDefault(event, duplicate, now.toEpochMilliseconds()),
                initial = form,
                form = form,
            )
        }
        val usable = allCategories.filter { it.ownerId == null || it.ownerId == session?.memberId }
        refilter {
            it.copy(
                phase = IcsImportUiState.Phase.Ready,
                rows = rows,
                skipped = parsed.skipped,
                from = now.toLocalDateTime(zone).date,
                categories = usable,
                duplicatesUnknown = duplicatesUnknown,
                zone = zone.id,
            )
        }
    }

    private fun updateRow(key: String, transform: (ImportRow) -> ImportRow) =
        updateRows { row -> if (row.key == key) transform(row) else row }

    private fun updateRows(transform: (ImportRow) -> ImportRow) = refilter { it.copy(rows = it.rows.map(transform)) }

    /** Applies [change], then recomputes which rows the filters keep. */
    private fun refilter(change: (IcsImportUiState) -> IcsImportUiState) = _state.update { before ->
        val s = change(before)
        val name = IcsReview.compileNameFilter(s.nameFilter)
        val range = DayRange(from = s.from?.toString(), to = s.to?.toString())
        val visible = s.rows.filter { row ->
            // A row edited to end before it starts stays in view (at its start) until it is fixed.
            val event = row.current.let { if (it.end < it.start) it.copy(end = it.start) else it }
            (name !is NameFilter.Valid || name.test(event.title)) && IcsReview.inRange(event, range, s.zone)
        }
        s.copy(visible = visible, nameFilterInvalid = name is NameFilter.InvalidRegex)
    }

    private companion object {
        /** The file's span, for the title + time duplicate match: first start to last end. */
        fun spanOf(events: List<IcsEvent>): TimeWindow = TimeWindow(
            Instant.fromEpochMilliseconds(events.minOf { it.start }),
            // fetchWindow's end is exclusive; an event can start where the last one ends.
            Instant.fromEpochMilliseconds(events.maxOf { maxOf(it.end, it.start) } + 1),
        )
    }
}
