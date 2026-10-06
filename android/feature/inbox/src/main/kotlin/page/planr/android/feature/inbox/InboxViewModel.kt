package page.planr.android.feature.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.inbox.InboxItem
import page.planr.android.core.data.inbox.InboxRules
import page.planr.android.core.data.model.SleepRatingForm
import page.planr.android.core.design.component.SleepRatingDraft
import page.planr.android.core.model.viewerTimeZone
import page.planr.android.feature.inbox.data.InboxDataSource

/** A write that didn't go through; the row is back and one calm line says so. */
enum class InboxError { RateFailed, RequestFailed }

/** The rating sheet over the Inbox, for one unlogged night. */
data class InboxSleepSheet(
    /** the [InboxItem.LogSleep] row it answers */
    val itemId: String,
    val form: SleepRatingForm,
    val saving: Boolean = false,
    /** the last save failed; the sheet stays open to retry */
    val failed: Boolean = false,
    /** the picked wake isn't after the picked bedtime; nothing was sent */
    val timesOutOfOrder: Boolean = false,
)

data class InboxUiState(
    /** until the rows are derived and the first refresh has finished (or failed) */
    val loading: Boolean = true,
    val requests: List<InboxItem.Request> = emptyList(),
    /** [InboxItem.RateEvent] and [InboxItem.RateTask] rows, newest first */
    val ratings: List<InboxItem> = emptyList(),
    val nights: List<InboxItem.LogSleep> = emptyList(),
    val zone: TimeZone = TimeZone.UTC,
    /** for the "Ended 2 hours ago" lines */
    val now: Instant = Instant.DISTANT_PAST,
    val error: InboxError? = null,
    val sheet: InboxSleepSheet? = null,
) {
    val count: Int get() = requests.size + ratings.size + nights.size
}

/**
 * The Inbox (inbox-shell.tsx): pending timeslot requests to approve or
 * decline, recently finished events and tasks to rate, recent nights to
 * log. Resolving a row hides it at once; a write that fails brings it
 * back with a calm error. Approving creates the event at the proposed time
 * first, then marks the request approved.
 */
@HiltViewModel
class InboxViewModel @Inject constructor(
    private val data: InboxDataSource,
    private val clock: Clock,
) : ViewModel() {

    /** Rows resolved (or being resolved) here: gone from the screen before the data catches up. */
    private val hidden = MutableStateFlow<Set<String>>(emptySet())
    private val error = MutableStateFlow<InboxError?>(null)
    private val sheet = MutableStateFlow<InboxSleepSheet?>(null)
    private val refreshed = MutableStateFlow(false)

    /** Requests whose event already exists: retrying a failed approval only marks them. */
    private val eventCreated = mutableSetOf<String>()

    private var refreshJob: Job? = null

    @Volatile
    private var latest: InboxSnapshot? = null

    val state: StateFlow<InboxUiState> = combine(
        data.snapshots(minuteTicks(clock), data.nightWindowOrDefault()),
        hidden,
        error,
        sheet,
        refreshed,
    ) { snapshot, hidden, error, sheet, refreshed ->
        latest = snapshot
        val items = snapshot?.items.orEmpty().filterNot { it.id in hidden }
        InboxUiState(
            loading = snapshot == null || !refreshed,
            requests = items.filterIsInstance<InboxItem.Request>(),
            ratings = items.filter { it is InboxItem.RateEvent || it is InboxItem.RateTask },
            nights = items.filterIsInstance<InboxItem.LogSleep>(),
            zone = snapshot?.zone ?: TimeZone.UTC,
            now = snapshot?.now ?: Instant.DISTANT_PAST,
            error = error,
            sheet = sheet,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), InboxUiState())

    init {
        refresh()
    }

    /**
     * Rereads what the rows come from: the requests, the nights, the tasks
     * and the last few days of events. Failures keep what is shown.
     */
    fun refresh() {
        if (refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            coroutineScope {
                launch { quietly { data.refreshRequests() } }
                launch { quietly { data.refreshSleep() } }
                launch { quietly { data.refreshTasks() } }
                launch { quietly { data.refreshWindow(InboxRules.occurrenceWindow(clock.now(), currentZone())) } }
            }
            refreshed.value = true
        }
    }

    /** Rates a finished event or task: satisfaction [option] ("1".."4") merged into its attributes. */
    fun rate(item: InboxItem, option: String) {
        if (option !in InboxRules.satisfactionOptions) return
        when (item) {
            is InboxItem.RateEvent -> resolve(item.id, InboxError.RateFailed) {
                data.rateEvent(item.eventId, InboxRules.rated(item.attributes, option))
            }
            is InboxItem.RateTask -> resolve(item.id, InboxError.RateFailed) {
                data.rateTask(item.taskId, InboxRules.rated(item.attributes, option))
            }
            else -> Unit
        }
    }

    /** Creates the viewer's event at the proposed time ([defaultTitle] for an anonymous requester), then approves. */
    fun approve(item: InboxItem.Request, defaultTitle: String) {
        val snapshot = latest ?: return
        resolve(item.id, InboxError.RequestFailed) {
            if (item.requestId !in eventCreated) {
                val draft = InboxRules.approvedEvent(
                    item,
                    workspaceId = snapshot.viewer.workspaceId,
                    ownerId = snapshot.viewer.memberId,
                    defaultTitle = defaultTitle,
                    zone = snapshot.zone,
                )
                data.createEvent(draft)
                eventCreated += item.requestId
            }
            data.markApproved(item.requestId)
        }
    }

    fun decline(item: InboxItem.Request) {
        resolve(item.id, InboxError.RequestFailed) { data.markDeclined(item.requestId) }
    }

    fun dismissError() {
        error.value = null
    }

    /** Opens the shared rating sheet on [item]'s night. */
    fun openNight(item: InboxItem.LogSleep) {
        val snapshot = latest ?: return
        sheet.value = InboxSleepSheet(item.id, SleepRatingForm.open(item.date, snapshot.logs, snapshot.zone))
    }

    fun updateDraft(draft: SleepRatingDraft) {
        sheet.update { it?.copy(form = it.form.with(draft), failed = false, timesOutOfOrder = false) }
    }

    fun closeSheet() {
        if (sheet.value?.saving == true) return
        sheet.value = null
    }

    /** Saves the night; the row leaves once it is stored (the sheet says so when it isn't). */
    fun saveSleep() {
        val current = sheet.value ?: return
        if (current.saving) return
        val zone = latest?.zone ?: return
        val rating = current.form.toRating(zone)
        if (!rating.timesInOrder) {
            sheet.value = current.copy(failed = false, timesOutOfOrder = true)
            return
        }
        sheet.value = current.copy(saving = true, failed = false)
        viewModelScope.launch {
            try {
                data.saveSleep(rating)
                // Saved with times only, the night still reads as unrated; the member answered.
                hidden.update { it + current.itemId }
                sheet.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                sheet.update { it?.copy(saving = false, failed = true) }
            }
        }
    }

    /** Hides [id] and runs [write]; on failure the row comes back and [failure] shows. */
    private fun resolve(id: String, failure: InboxError, write: suspend () -> Unit) {
        if (id in hidden.value) return
        hidden.update { it + id }
        error.value = null
        viewModelScope.launch {
            try {
                write()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                hidden.update { it - id }
                error.value = failure
            }
        }
    }

    private suspend fun currentZone(): TimeZone {
        val viewer = data.viewer.first() ?: return TimeZone.currentSystemDefault()
        return viewerTimeZone(data.observeMembers().first().firstOrNull { it.id == viewer.memberId })
    }

    private suspend fun quietly(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // keep what is shown
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}

/** The sheet's values for the shared [SleepRatingDraft] (minutes after midnight). */
internal fun SleepRatingForm.toDraft(): SleepRatingDraft = SleepRatingDraft(
    bedtimeMinutes = bedtime.hour * 60 + bedtime.minute,
    wakeMinutes = wake.hour * 60 + wake.minute,
    quality = quality,
    fatigue = fatigue,
    note = note,
    timesEdited = timesEdited,
)

internal fun SleepRatingForm.with(draft: SleepRatingDraft): SleepRatingForm = copy(
    bedtime = LocalTime(draft.bedtimeMinutes / 60, draft.bedtimeMinutes % 60),
    wake = LocalTime(draft.wakeMinutes / 60, draft.wakeMinutes % 60),
    quality = draft.quality,
    fatigue = draft.fatigue,
    note = draft.note,
    timesEdited = draft.timesEdited,
)
