package page.planr.android.feature.agenda.sleep

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRatingForm
import page.planr.android.core.data.repository.SleepLogRepository
import page.planr.android.core.design.R as DesignR
import page.planr.android.core.design.component.SleepRatingDraft
import page.planr.android.feature.agenda.data.AgendaDataSource
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.UiText
import page.planr.android.feature.agenda.model.viewerZone
import page.planr.android.feature.agenda.runCatchingNonCancel

/**
 * The morning sleep check-in on the agenda: a one-line card while last
 * night is unrated (see [SleepCheckinRules]), opening the shared rating
 * sheet. Saving refreshes the nights, which hides the card; the X hides it
 * until tomorrow on this device. The confirmation goes through
 * [AgendaNotices], so it honors the member's `show_success_toasts`.
 */
@HiltViewModel
class SleepCheckinViewModel @Inject constructor(
    private val sleep: SleepLogRepository,
    private val data: AgendaDataSource,
    private val notices: AgendaNotices,
    private val clock: Clock,
) : ViewModel() {

    /** Emits now, then on every wall-clock minute, so the card leaves at [SleepCheckinRules.UNTIL_HOUR]. */
    private val minutes: Flow<Instant> = flow {
        while (true) {
            val now = clock.now()
            emit(now)
            delay(MINUTE_MS - now.toEpochMilliseconds() % MINUTE_MS)
        }
    }

    private val zone: Flow<TimeZone> = data.observeMembers()
        .map { members -> viewerZone(members.firstOrNull { it.id == data.currentSession()?.memberId }) }
        .distinctUntilChanged()

    private val sheet = MutableStateFlow<SleepCheckinSheet?>(null)

    @Volatile
    private var latestLogs: List<SleepLog> = emptyList()

    @Volatile
    private var latestZone: TimeZone = TimeZone.currentSystemDefault()

    val state: StateFlow<SleepCheckinUiState> = combine(
        minutes,
        zone,
        sleep.recentLogs,
        sleep.checkinDismissedOn,
        sheet,
    ) { now, zone, logs, dismissed, sheet ->
        latestLogs = logs.orEmpty()
        latestZone = zone
        val card = if (data.currentSession() == null) null else SleepCheckinRules.card(now, zone, logs, dismissed)
        SleepCheckinUiState(card = card, sheet = sheet)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SleepCheckinUiState())

    init {
        refresh()
    }

    /** Rereads the nights (on start and whenever the agenda comes back); failures keep what is shown. */
    fun refresh() {
        if (data.currentSession() == null) return
        viewModelScope.launch { runCatchingNonCancel { sleep.refresh() } }
    }

    /** Opens the sheet on the card's night. */
    fun openSheet() {
        val card = state.value.card ?: return
        sheet.value = SleepCheckinSheet(SleepRatingForm.open(card.date, latestLogs, latestZone))
    }

    fun updateDraft(draft: SleepRatingDraft) {
        sheet.update { it?.copy(form = it.form.with(draft), failed = false) }
    }

    fun closeSheet() {
        if (sheet.value?.saving == true) return
        sheet.value = null
    }

    fun save() {
        val current = sheet.value ?: return
        if (current.saving) return
        sheet.value = current.copy(saving = true, failed = false)
        val rating = current.form.toRating(latestZone)
        viewModelScope.launch {
            try {
                sleep.save(rating)
                sheet.value = null
                notices.post(AgendaNotice(UiText(DesignR.string.sleep_rating_saved)))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                sheet.update { it?.copy(saving = false, failed = true) }
            }
        }
    }

    /** The X: no card again until tomorrow, on this device. */
    fun dismissCard() {
        val card = state.value.card ?: return
        viewModelScope.launch { runCatchingNonCancel { sleep.dismissCheckin(card.date) } }
    }

    private companion object {
        const val MINUTE_MS = 60_000L
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
