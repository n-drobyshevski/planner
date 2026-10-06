package page.planr.android.feature.agenda.edit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.model.Category
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.recurrence.RecurrenceExpander
import page.planr.android.feature.agenda.EventEditTarget
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.data.AgendaDataSource
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.EventRef
import page.planr.android.feature.agenda.model.RecurrenceScope
import page.planr.android.feature.agenda.model.UiText
import page.planr.android.feature.agenda.model.findOccurrence
import page.planr.android.feature.agenda.model.viewerZone

/**
 * Creates an event, or edits one. Saving a series instance first asks which
 * instances to change, then maps the answer like the web's event dialog:
 * this → a modify override, this and following → a series split, all → the
 * master row (shifted by how far this instance moved). Single-event and
 * whole-series writes carry the `updated_at` they were based on, so a
 * concurrent edit elsewhere comes back as [EventEditEffect.Stale].
 */
@HiltViewModel(assistedFactory = EventEditViewModel.Factory::class)
class EventEditViewModel @AssistedInject constructor(
    @Assisted private val target: EventEditTarget,
    private val data: AgendaDataSource,
    private val expander: RecurrenceExpander,
    private val notices: AgendaNotices,
    private val clock: Clock,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(target: EventEditTarget): EventEditViewModel
    }

    private val _state = MutableStateFlow(EventEditUiState(isNew = target is EventEditTarget.New))
    val state: StateFlow<EventEditUiState> = _state.asStateFlow()

    private val _effects = Channel<EventEditEffect>(Channel.BUFFERED)
    val effects: Flow<EventEditEffect> = _effects.receiveAsFlow()

    /** What is being edited (null when creating). */
    private var editing: Editing? = null

    /** The form as loaded, to tell which series-level fields actually changed. */
    private var initialForm: EventForm? = null
    private var allCategories: List<Category> = emptyList()

    init {
        viewModelScope.launch { load() }
    }

    /** Applies a field change; clears a shown error once the form is valid again. */
    fun update(transform: (EventForm) -> EventForm) {
        _state.update { s ->
            val form = s.form?.let(transform) ?: return@update s
            s.copy(form = form, dirty = form != initialForm, error = s.error?.let { form.validate() })
        }
    }

    fun save() {
        val s = _state.value
        val form = s.form ?: return
        if (s.saving) return
        val error = form.validate()
        if (error != null) {
            _state.update { it.copy(error = error) }
            return
        }
        val current = editing
        when {
            current == null -> write { create(form) }
            current.event.isRecurring -> _state.update { it.copy(askScope = true) }
            else -> write { updateSingle(form, current) }
        }
    }

    fun chooseScope(scope: RecurrenceScope) {
        val form = _state.value.form ?: return
        val current = editing ?: return
        _state.update { it.copy(askScope = false) }
        write { updateRecurring(form, current, scope) }
    }

    fun dismissScope() = _state.update { it.copy(askScope = false) }

    /** After a stale write: re-read the (already reloaded) event and reset the form to it. */
    fun reloadLatest() {
        viewModelScope.launch { load() }
    }

    private suspend fun create(form: EventForm) {
        val session = data.currentSession() ?: error("Not signed in")
        val created = data.createEvent(EventWrites.draft(form, session.workspaceId, session.memberId, allCategories))
        notices.post(AgendaNotice(UiText(R.string.agenda_toast_event_created), undo = { data.deleteEvent(created.id) }))
    }

    private suspend fun updateSingle(form: EventForm, current: Editing) {
        val initial = initialForm ?: form
        data.updateEvent(
            current.event.id,
            EventWrites.singlePatch(form, initial, allCategories),
            expectedUpdatedAt = current.event.updatedAt,
        )
        notices.post(AgendaNotice(UiText(R.string.agenda_toast_event_updated)))
    }

    private suspend fun updateRecurring(form: EventForm, current: Editing, scope: RecurrenceScope) {
        val event = current.event
        val occurrenceDate = current.occurrence.occurrenceDate
        when (scope) {
            RecurrenceScope.This -> {
                val input = EditSemantics.modifyOccurrence(event.id, occurrenceDate, EventWrites.occurrencePatch(form))
                val prior = data.applyOverride(input)
                notices.post(
                    AgendaNotice(
                        UiText(R.string.agenda_toast_this_event_updated),
                        // Without a known prior, an undo could erase an earlier override.
                        undo = suspend { data.revertOverride(event.id, occurrenceDate, prior) }
                            .takeIf { prior.canRevert },
                    ),
                )
            }
            RecurrenceScope.Following -> {
                val created = data.splitSeries(event, occurrenceDate, EventWrites.occurrencePatch(form))
                notices.post(
                    AgendaNotice(UiText(R.string.agenda_toast_this_and_future_updated)) {
                        // Undo the split: restore the original rule FIRST, then drop the
                        // new series. A failed restore keeps the new series, so the
                        // future occurrences are never lost.
                        data.updateEvent(event.id, restoreRecurrence(event))
                        data.deleteEvent(created.id)
                    },
                )
            }
            RecurrenceScope.All -> {
                val initial = initialForm ?: form
                data.updateEvent(
                    event.id,
                    EventWrites.seriesPatch(form, initial, event, current.occurrence, allCategories),
                    expectedUpdatedAt = event.updatedAt,
                )
                notices.post(AgendaNotice(UiText(R.string.agenda_toast_all_events_updated)))
            }
        }
    }

    /** Runs a write with the saving flag up; maps its failure to an effect. */
    private fun write(block: suspend () -> Unit) {
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val effect = try {
                block()
                EventEditEffect.Done
            } catch (e: CancellationException) {
                throw e
            } catch (_: StaleWriteException) {
                EventEditEffect.Stale
            } catch (_: Exception) {
                EventEditEffect.Failed
            }
            _state.update { it.copy(saving = false) }
            _effects.send(effect)
        }
    }

    private suspend fun load() {
        val session = data.currentSession()
        val members = data.observeMembers().first()
        allCategories = data.observeCategories().first()
        val zone = viewerZone(members.firstOrNull { it.id == session?.memberId })
        val usable = allCategories.filter { it.ownerId == null || it.ownerId == session?.memberId }

        val form = when (target) {
            is EventEditTarget.New -> EventForm.blank(target.start ?: nextHalfHour(clock.now()), zone)
            is EventEditTarget.Existing -> {
                val ref = EventRef.parse(target.ref)
                val event = data.getEvent(ref.eventId)
                val shared = allCategories.filter { it.isShared }.map { it.id }.toSet()
                val occurrence = event?.let {
                    findOccurrence(it, data.observeOverrides(it.id).first(), ref, expander, shared)
                }
                if (event == null || occurrence == null) {
                    _state.update { it.copy(phase = EventEditUiState.Phase.Missing) }
                    return
                }
                editing = Editing(event, occurrence)
                EventForm.of(event, occurrence, zone)
            }
        }
        initialForm = form
        // Keep the current context listed even when it isn't one the viewer could pick.
        val current = allCategories.filter { it.id == form.categoryId && it !in usable }
        _state.update {
            it.copy(
                phase = EventEditUiState.Phase.Ready,
                form = form,
                categories = usable + current,
                isRecurringEdit = editing?.event?.isRecurring == true,
                dirty = false,
                error = null,
            )
        }
    }

    private data class Editing(val event: PlannerEvent, val occurrence: Occurrence)

    private companion object {
        /** The next half hour (`ceilToStep(Date.now(), 30)`). */
        fun nextHalfHour(now: Instant): Instant {
            val step = 30.minutes.inWholeMilliseconds
            val ms = now.toEpochMilliseconds()
            return Instant.fromEpochMilliseconds((ms + step - 1) / step * step)
        }
    }
}

/** The patch that puts a series' recurrence back the way it was (undo of a split / cap). */
internal fun restoreRecurrence(event: PlannerEvent) = EventPatch(
    rrule = PatchField.Value(event.rrule),
    recurrenceEndsAt = PatchField.Value(event.recurrenceEndsAt),
)
