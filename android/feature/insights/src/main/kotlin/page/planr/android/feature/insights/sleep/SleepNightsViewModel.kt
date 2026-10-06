package page.planr.android.feature.insights.sleep

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRatingForm
import page.planr.android.core.data.repository.SleepLogRepository
import page.planr.android.core.design.component.SleepRatingDraft
import page.planr.android.core.model.viewerTimeZone
import page.planr.android.feature.insights.data.InsightsDataSource

/** The rating sheet over the Sleep tab. */
data class SleepTabSheet(
    val form: SleepRatingForm,
    val saving: Boolean = false,
    /** the last save failed; the sheet stays open to retry */
    val failed: Boolean = false,
    /** the picked wake isn't after the picked bedtime; nothing was sent */
    val timesOutOfOrder: Boolean = false,
)

data class SleepTabUiState(
    /** null until the viewer's nights first load */
    val model: SleepNightsModel? = null,
    val isRefreshing: Boolean = false,
    /** the last read failed (offline): a banner over what is shown, or the error block */
    val loadFailed: Boolean = false,
    val sheet: SleepTabSheet? = null,
)

/**
 * The Insights Sleep tab: the viewer's own last nights ([SleepNightsModelBuilder]),
 * each opening the shared rating sheet to rate or edit it. Reads only when
 * the tab is shown ([onShown]); the period and the filters don't apply.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class SleepNightsViewModel @Inject constructor(
    private val sleep: SleepLogRepository,
    private val data: InsightsDataSource,
    private val clock: Clock,
) : ViewModel() {

    private val zone: Flow<TimeZone> = data.currentMemberId.flatMapLatest { id ->
        if (id == null) {
            flowOf(TimeZone.currentSystemDefault())
        } else {
            data.observeMembers().map { members -> viewerTimeZone(members.firstOrNull { it.id == id }) }
        }
    }.distinctUntilChanged()

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val sheet = MutableStateFlow<SleepTabSheet?>(null)

    @Volatile
    private var latestLogs: List<SleepLog> = emptyList()

    @Volatile
    private var latestZone: TimeZone = TimeZone.currentSystemDefault()

    val state: StateFlow<SleepTabUiState> = combine(
        sleep.recentLogs,
        zone,
        refreshing,
        loadFailed,
        sheet,
    ) { logs, zone, refreshing, failed, sheet ->
        latestLogs = logs.orEmpty()
        latestZone = zone
        val today = clock.now().toLocalDateTime(zone).date
        SleepTabUiState(
            model = logs?.let { SleepNightsModelBuilder.build(it, today, zone) },
            isRefreshing = refreshing,
            loadFailed = failed,
            sheet = sheet,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SleepTabUiState())

    /** The tab came on screen (or back to it): reread quietly. */
    fun onShown() = load(userInitiated = false)

    /** Pull-to-refresh and the error block's retry. */
    fun refresh() = load(userInitiated = true)

    private fun load(userInitiated: Boolean) {
        if (refreshing.value) return
        viewModelScope.launch {
            if (userInitiated) refreshing.value = true
            try {
                sleep.refresh()
                loadFailed.value = false
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                loadFailed.value = true
            } finally {
                refreshing.value = false
            }
        }
    }

    /** Opens the sheet on [date]'s night. */
    fun openNight(date: LocalDate) {
        sheet.value = SleepTabSheet(SleepRatingForm.open(date, latestLogs, latestZone))
    }

    fun updateDraft(draft: SleepRatingDraft) {
        sheet.update { it?.copy(form = it.form.with(draft), failed = false, timesOutOfOrder = false) }
    }

    fun closeSheet() {
        if (sheet.value?.saving == true) return
        sheet.value = null
    }

    /** Saves the night; the list shows it at once (the repository updates its nights). */
    fun save() {
        val current = sheet.value ?: return
        if (current.saving) return
        val rating = current.form.toRating(latestZone)
        if (!rating.timesInOrder) {
            sheet.value = current.copy(failed = false, timesOutOfOrder = true)
            return
        }
        sheet.value = current.copy(saving = true, failed = false)
        viewModelScope.launch {
            try {
                sleep.save(rating)
                sheet.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                sheet.update { it?.copy(saving = false, failed = true) }
            }
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
