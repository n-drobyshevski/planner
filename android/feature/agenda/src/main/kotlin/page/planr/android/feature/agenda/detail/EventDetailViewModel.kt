package page.planr.android.feature.agenda.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.days
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Member
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.core.recurrence.RRuleBuild
import page.planr.android.core.recurrence.RecurrenceExpander
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.data.AgendaDataSource
import page.planr.android.feature.agenda.edit.restoreRecurrence
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.EventRef
import page.planr.android.feature.agenda.model.RecurrenceScope
import page.planr.android.feature.agenda.model.UiText
import page.planr.android.feature.agenda.model.agendaBlockOf
import page.planr.android.feature.agenda.model.findOccurrence
import page.planr.android.feature.agenda.model.viewerZone
import page.planr.android.feature.agenda.runCatchingNonCancel

/**
 * One occurrence's detail, live from the local cache, plus delete. Deleting
 * an instance of a series takes a [RecurrenceScope] (the web's
 * `onDeleteScope`): this → a cancel override, this and following → the
 * series is capped, all → the series row is deleted. Every delete offers Undo.
 */
@HiltViewModel(assistedFactory = EventDetailViewModel.Factory::class)
class EventDetailViewModel @AssistedInject constructor(
    @Assisted ref: String,
    private val data: AgendaDataSource,
    private val expander: RecurrenceExpander,
    private val notices: AgendaNotices,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(ref: String): EventDetailViewModel
    }

    private val ref = EventRef.parse(ref)

    /** Set once a delete went through, so the vanishing row doesn't flash "not found". */
    private val deleted = MutableStateFlow(false)

    private val _closed = Channel<Unit>(Channel.CONFLATED)

    /** Emits when the screen should close (after a delete). */
    val closed: Flow<Unit> = _closed.receiveAsFlow()

    private val _failed = Channel<UiText>(Channel.CONFLATED)

    /**
     * Emits the message when a delete didn't go through. The screen stays open
     * and shows it itself: the agenda underneath isn't started, so a notice
     * posted there would only surface later, out of context.
     */
    val failed: Flow<UiText> = _failed.receiveAsFlow()

    private val _deleting = MutableStateFlow(false)
    val deleting: StateFlow<Boolean> = _deleting.asStateFlow()

    val state: StateFlow<EventDetailUiState> = combine(
        data.observeEvent(this.ref.eventId),
        data.observeOverrides(this.ref.eventId),
        data.observeMembers(),
        data.observeCategories(),
    ) { event, overrides, members, categories ->
        detailOf(event, overrides, members, categories)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), EventDetailUiState.Loading)

    init {
        // Opened from a widget or a link before the cache has the event: fetch around it
        // (forced: the cache is known to lack it, however recently that window was fetched).
        viewModelScope.launch {
            val anchor = this@EventDetailViewModel.ref.occurrenceDate
            if (anchor != null && data.getEvent(this@EventDetailViewModel.ref.eventId) == null) {
                runCatchingNonCancel { data.refreshWindow(TimeWindow(anchor - 1.days, anchor + 1.days), force = true) }
            }
        }
    }

    /** Deletes the event, or for a series instance the chosen [scope] of it. */
    fun delete(scope: RecurrenceScope? = null) {
        val detail = (state.value as? EventDetailUiState.Ready)?.detail ?: return
        if (_deleting.value || !detail.canEdit) return
        val event = detail.event
        val occurrenceDate = detail.occurrence.occurrenceDate
        _deleting.value = true
        viewModelScope.launch {
            try {
                // A single event has no scope; a series instance defaults to "this event".
                val effectiveScope = if (event.isRecurring) scope ?: RecurrenceScope.This else null
                val notice = when (effectiveScope) {
                    null -> {
                        val snapshot = data.deleteEvent(event.id)
                        AgendaNotice(UiText(R.string.agenda_toast_event_deleted)) { data.restoreEvent(snapshot) }
                    }
                    RecurrenceScope.This -> {
                        val prior = data.applyOverride(EditSemantics.cancelOccurrence(event.id, occurrenceDate))
                        AgendaNotice(
                            UiText(R.string.agenda_toast_event_deleted),
                            // Without a known prior, an undo could erase an earlier override.
                            undo = suspend { data.revertOverride(event.id, occurrenceDate, prior) }
                                .takeIf { prior.canRevert },
                        )
                    }
                    RecurrenceScope.Following -> {
                        data.deleteThisAndFuture(event, occurrenceDate)
                        AgendaNotice(UiText(R.string.agenda_toast_this_and_future_deleted)) {
                            data.updateEvent(event.id, restoreRecurrence(event))
                        }
                    }
                    RecurrenceScope.All -> {
                        val snapshot = data.deleteEvent(event.id)
                        AgendaNotice(UiText(R.string.agenda_toast_series_deleted)) { data.restoreEvent(snapshot) }
                    }
                }
                deleted.value = true
                notices.post(notice)
                _closed.send(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _failed.send(UiText(R.string.agenda_something_went_wrong))
            } finally {
                _deleting.value = false
            }
        }
    }

    private fun detailOf(
        event: PlannerEvent?,
        overrides: List<EventOverride>,
        members: List<Member>,
        categories: List<Category>,
    ): EventDetailUiState {
        if (deleted.value) return state.value
        event ?: return EventDetailUiState.Missing
        val shared = categories.filter { it.isShared }.map { it.id }.toSet()
        val occurrence = findOccurrence(event, overrides, ref, expander, shared) ?: return EventDetailUiState.Missing
        val viewerId = data.currentSession()?.memberId
        val memberMap = members.associateBy { it.id }
        val owner = memberMap[event.ownerId]
        return EventDetailUiState.Ready(
            EventDetail(
                event = event,
                occurrence = occurrence,
                block = agendaBlockOf(occurrence, viewerId, memberMap, categories.associateBy { it.id }),
                ownerName = owner?.name,
                ownerColor = owner?.color,
                isOwn = event.ownerId == viewerId,
                category = occurrence.categoryId?.let { id -> categories.firstOrNull { it.id == id } },
                recurrence = RRuleBuild.parseRRule(event.rrule),
                zone = viewerZone(memberMap[viewerId]),
            ),
        )
    }
}
