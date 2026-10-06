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
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.attributes.AttributeKey
import page.planr.android.core.data.attributes.AttributesMerge
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.model.OverridePrior
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.model.Category
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.recurrence.RecurrenceExpander
import page.planr.android.core.recurrence.SeriesEnd
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
            EventWrites.singlePatch(form, initial, allCategories, current.event.attributes),
            expectedUpdatedAt = current.event.updatedAt,
        )
        notices.post(AgendaNotice(UiText(R.string.agenda_toast_event_updated)))
    }

    private suspend fun updateRecurring(form: EventForm, current: Editing, scope: RecurrenceScope) {
        val event = current.event
        val occurrenceDate = current.occurrence.occurrenceDate
        val initial = initialForm ?: form
        val attributes = EventWrites.mergedAttributes(form, initial, event.attributes)
        when (scope) {
            RecurrenceScope.This -> {
                val input = EditSemantics.modifyOccurrence(event.id, occurrenceDate, EventWrites.occurrencePatch(form))
                val prior = data.applyOverride(input)
                // An override can't carry series-level fields (event_overrides
                // has no attributes): an attribute change goes to the whole
                // series in a side patch (as on the web), only once the
                // instance's own change landed, so a failed save leaves the
                // series untouched.
                if (attributes != null) patchSeriesAttributes(event, occurrenceDate, prior, attributes)
                val edits = AttributesMerge.edits(initial.attributes, form.attributes)
                notices.post(
                    AgendaNotice(
                        UiText(R.string.agenda_toast_this_event_updated),
                        // Without a known prior, an undo could erase an earlier override.
                        undo = suspend {
                            data.revertOverride(event.id, occurrenceDate, prior)
                            if (attributes != null) undoSeriesAttributes(event.id, edits, initial.attributes)
                        }.takeIf { prior.canRevert },
                    ),
                )
            }
            RecurrenceScope.Following -> {
                val patch = EventWrites.occurrencePatch(form)
                val created = data.splitSeries(event, occurrenceDate, patch, attributes)
                // The rule the split capped the original to (the same split the write made).
                val cap = capRecurrence(EditSemantics.splitThisAndFuture(event, occurrenceDate, patch).original)
                notices.post(
                    AgendaNotice(UiText(R.string.agenda_toast_this_and_future_updated)) {
                        // Undo the split: restore the original rule FIRST, then drop the
                        // new series. A failed restore keeps the new series, so the
                        // future occurrences are never lost.
                        try {
                            data.updateEvent(event.id, restoreRecurrence(event))
                        } catch (e: Throwable) {
                            // The restore may have landed with only its answer lost (a
                            // timeout, or the agenda closing mid-request): cap again so the
                            // future doesn't show twice. The new series is untouched.
                            withContext(NonCancellable) { runCatching { data.updateEvent(event.id, cap) } }
                            throw e
                        }
                        try {
                            data.deleteEvent(created.id)
                        } catch (e: Throwable) {
                            withContext(NonCancellable) {
                                // The delete may have landed with only its answer lost, and
                                // capping then would end the future for both members. It is
                                // idempotent, so try it once more first.
                                if (runCatching { data.deleteEvent(created.id) }.isFailure) {
                                    // Both series are live, so every future occurrence shows
                                    // twice: cap the original again (back to the split).
                                    runCatching { data.updateEvent(event.id, cap) }
                                    throw e
                                }
                            }
                            // The second try dropped it: the undo is done.
                            if (e is CancellationException) throw e
                        }
                    },
                )
            }
            RecurrenceScope.All -> {
                data.updateEvent(
                    event.id,
                    EventWrites.seriesPatch(form, initial, event, current.occurrence, allCategories),
                    expectedUpdatedAt = event.updatedAt,
                )
                notices.post(AgendaNotice(UiText(R.string.agenda_toast_all_events_updated)))
            }
        }
    }

    /**
     * The side patch of a "this event" save. [attributes] was merged into the
     * bag read at load, so it is written only if the series hasn't changed
     * since ([StaleWriteException] otherwise): the partner's newer attribute
     * edits are never overwritten. When it fails, the override just applied
     * is reverted (best effort) before the failure surfaces, so the save
     * fails as a whole and saving again redoes both.
     */
    private suspend fun patchSeriesAttributes(
        event: PlannerEvent,
        occurrenceDate: Instant,
        prior: OverridePrior,
        attributes: JsonObject,
    ) {
        try {
            data.updateEvent(event.id, attributesPatch(attributes), expectedUpdatedAt = event.updatedAt)
        } catch (e: Exception) {
            if (e !is CancellationException && prior.canRevert) {
                try {
                    data.revertOverride(event.id, occurrenceDate, prior)
                } catch (revert: Exception) {
                    if (revert is CancellationException) throw revert
                    e.addSuppressed(revert)
                }
            }
            throw e
        }
    }

    /**
     * Undo of a "this event" side patch: puts back only the keys the save
     * edited ([edits]) to their [before] option, merged into the series' bag
     * as it is now, and only where the series still shows what the save
     * wrote. Whatever changed elsewhere since the save (other keys, or the
     * same key edited again) is kept.
     */
    private suspend fun undoSeriesAttributes(
        eventId: String,
        edits: Map<AttributeKey, String?>,
        before: Map<AttributeKey, String>,
    ) {
        val latest = data.getEvent(eventId) ?: return
        val now = AttributesMerge.known(latest.attributes)
        val inverse = edits.filter { (key, wrote) -> now[key] == wrote }.mapValues { (key, _) -> before[key] }
        if (inverse.isEmpty()) return
        data.updateEvent(
            eventId,
            attributesPatch(AttributesMerge.merge(latest.attributes, inverse)),
            expectedUpdatedAt = latest.updatedAt,
        )
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

/** A patch replacing only the series' attribute bag. */
private fun attributesPatch(attributes: JsonObject) = EventPatch(attributes = PatchField.Value(attributes))

/** The patch that puts a series' recurrence back the way it was (undo of a split / cap). */
internal fun restoreRecurrence(event: PlannerEvent) = EventPatch(
    rrule = PatchField.Value(event.rrule),
    recurrenceEndsAt = PatchField.Value(event.recurrenceEndsAt),
)

/** The patch that ends a series where a split capped it (re-applied when a split's undo stops halfway). */
internal fun capRecurrence(end: SeriesEnd) = EventPatch(
    rrule = PatchField.Value(end.rrule),
    recurrenceEndsAt = PatchField.Value(end.recurrenceEndsAt),
)
