package page.planr.android.feature.quickadd

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.data.auth.NotSignedInException
import page.planr.android.feature.quickadd.data.QuickAddDataSource
import page.planr.android.feature.quickadd.model.QuickAddError
import page.planr.android.feature.quickadd.model.QuickAddForm
import page.planr.android.feature.quickadd.model.SharedText

data class QuickAddUiState(
    val form: QuickAddForm,
    /** The viewer's today, for the Today / Tomorrow shortcuts. */
    val today: LocalDate,
    val saving: Boolean = false,
    val error: QuickAddError? = null,
    /** Set once the item is created; the sheet then closes. */
    val saved: QuickAddSaved? = null,
) {
    val tomorrow: LocalDate get() = today.plus(DatePeriod(days = 1))

    /**
     * Something typed (or shared) that closing the sheet would drop, so a
     * swipe, a tap outside or Back asks first. The day and times alone are
     * defaults, and a saved item is no longer a draft.
     */
    val hasDraft: Boolean get() = saved == null && (form.title.isNotBlank() || form.notes.isNotBlank())
}

/**
 * Quick add: a title and the minimum to place it, created through the
 * repositories. One view model serves every opening of the sheet; [start]
 * resets it for a fresh one. It outlives the sheet, so the confirmation's
 * Undo ([undo]) can still delete what was just created.
 */
@HiltViewModel
class QuickAddViewModel @Inject constructor(
    private val data: QuickAddDataSource,
    private val clock: Clock,
) : ViewModel() {

    private var zone: TimeZone = TimeZone.currentSystemDefault()
    /** The user picked a date or time; a late-arriving zone must not move it. */
    private var whenEdited = false
    private var zoneJob: Job? = null
    /** Counts [start]s, so a save still in flight from a closed opening can't land in the next one. */
    private var opening = 0

    private val _state = MutableStateFlow(fresh(QuickAddKind.Task))
    val state: StateFlow<QuickAddUiState> = _state.asStateFlow()

    private val _undoFailures = Channel<QuickAddSaved>(Channel.BUFFERED)

    /** An [undo] that didn't go through (offline, signed out): the item is still there. */
    val undoFailures: Flow<QuickAddSaved> = _undoFailures.receiveAsFlow()

    /**
     * Opens a fresh sheet for [kind], prefilled from [shared] text when given,
     * and resolves the viewer's zone (the member's, else the device's).
     */
    fun start(kind: QuickAddKind, shared: SharedText? = null) {
        whenEdited = false
        opening++
        _state.value = fresh(kind).let { state ->
            if (shared == null) state else state.copy(form = state.form.copy(title = shared.title, notes = shared.notes))
        }
        zoneJob?.cancel()
        zoneJob = viewModelScope.launch {
            val resolved = runCatching { data.viewerZone() }.getOrNull() ?: return@launch
            if (resolved == zone) return@launch
            zone = resolved
            val today = clock.now().toLocalDateTime(resolved).date
            _state.update { if (whenEdited) it.copy(today = today) else it.copy(today = today, form = refreshTimes(it.form)) }
        }
    }

    fun setKind(kind: QuickAddKind) = edit { it.copy(kind = kind) }

    fun setTitle(title: String) = edit { it.copy(title = title) }

    fun setNotes(notes: String) = edit { it.copy(notes = notes) }

    fun setDueDate(date: LocalDate?) = edit(timing = true) { it.copy(dueDate = date) }

    fun setDate(date: LocalDate) = edit(timing = true) { it.copy(date = date) }

    fun setAllDay(allDay: Boolean) = edit(timing = true) { it.copy(allDay = allDay) }

    fun setStartTime(time: LocalTime) = edit(timing = true) { it.withStartTime(time) }

    fun setEndTime(time: LocalTime) = edit(timing = true) { it.copy(endTime = time) }

    fun save() {
        val current = _state.value
        if (current.saving || current.saved != null) return
        current.form.validate()?.let { error ->
            _state.update { it.copy(error = error) }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        val form = current.form
        val savingOpening = opening
        viewModelScope.launch {
            var saved: QuickAddSaved? = null
            val error = try {
                val id = when (form.kind) {
                    QuickAddKind.Task -> data.createTask(form.title, form.dueDate, form.description).id
                    QuickAddKind.Event -> {
                        val (start, end) = form.eventTimes(zone)
                        data.createEvent(form.title, start, end, form.allDay, zone, form.description).id
                    }
                }
                saved = QuickAddSaved(form.kind, id)
                null
            } catch (e: CancellationException) {
                throw e
            } catch (_: NotSignedInException) {
                QuickAddError.NotSignedIn
            } catch (_: Exception) {
                QuickAddError.Failed
            }
            // Cancelled mid-save and reopened: the result belongs to a sheet that is gone,
            // and must not close (or mark as failed) the one now being filled in.
            if (savingOpening != opening) return@launch
            _state.update { it.copy(saving = false, error = error, saved = saved) }
        }
    }

    /**
     * Deletes what [saved] created, through the repositories (so the agenda,
     * the task list and the widgets drop it too). A failure is reported on
     * [undoFailures].
     */
    fun undo(saved: QuickAddSaved) {
        viewModelScope.launch {
            try {
                when (saved.kind) {
                    QuickAddKind.Task -> data.deleteTask(saved.id)
                    QuickAddKind.Event -> data.deleteEvent(saved.id)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _undoFailures.trySend(saved)
            }
        }
    }

    private fun edit(timing: Boolean = false, change: (QuickAddForm) -> QuickAddForm) {
        if (_state.value.saving) return
        if (timing) whenEdited = true
        _state.update { it.copy(form = change(it.form), error = null) }
    }

    private fun fresh(kind: QuickAddKind): QuickAddUiState {
        val now = clock.now()
        return QuickAddUiState(
            form = QuickAddForm.initial(kind, now, zone),
            today = now.toLocalDateTime(zone).date,
        )
    }

    /** Re-derives the default day and times in the newly known zone, keeping title, notes and kind. */
    private fun refreshTimes(form: QuickAddForm): QuickAddForm {
        val defaults = QuickAddForm.initial(form.kind, clock.now(), zone)
        return form.copy(date = defaults.date, startTime = defaults.startTime, endTime = defaults.endTime)
    }
}
