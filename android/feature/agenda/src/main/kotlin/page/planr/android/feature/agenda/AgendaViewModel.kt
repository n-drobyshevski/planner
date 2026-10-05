package page.planr.android.feature.agenda

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow
import page.planr.android.feature.agenda.data.AgendaDataSource
import page.planr.android.feature.agenda.model.AgendaDayRequests
import page.planr.android.feature.agenda.model.AgendaMode
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.AgendaNotices
import page.planr.android.feature.agenda.model.AgendaPeriods
import page.planr.android.feature.agenda.model.DaySchedule
import page.planr.android.feature.agenda.model.UiText
import page.planr.android.feature.agenda.model.agendaBlockOf
import page.planr.android.feature.agenda.model.scheduleDays
import page.planr.android.feature.agenda.model.viewerZone

/**
 * The day / week agenda. Reads occurrences from the local cache (kept fresh
 * by Realtime and background sync), fetches each newly shown window from
 * Supabase, and owns navigation between periods. Mode and focus survive
 * process death through [SavedStateHandle].
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class AgendaViewModel @Inject constructor(
    private val data: AgendaDataSource,
    private val clock: Clock,
    private val notices: AgendaNotices,
    private val savedState: SavedStateHandle,
    private val dayRequests: AgendaDayRequests,
) : ViewModel() {

    private val mode = savedState.getStateFlow(KEY_MODE, AgendaMode.Day.name).map { AgendaMode.valueOf(it) }

    /** ISO date in focus; null follows today (also across midnight). */
    private val focus = savedState.getStateFlow<String?>(KEY_FOCUS, null)

    private val refreshing = MutableStateFlow(false)
    private val ownNotices = Channel<AgendaNotice>(Channel.BUFFERED)

    /** Emits now, then on every wall-clock minute. */
    private val minutes: Flow<Instant> = flow {
        while (true) {
            val now = clock.now()
            emit(now)
            delay(MINUTE_MS - now.toEpochMilliseconds() % MINUTE_MS)
        }
    }.shareIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), replay = 1)

    private val workspace: StateFlow<Workspace> = combine(data.observeMembers(), data.observeCategories()) { m, c ->
        Workspace(m, c, data.currentSession()?.memberId)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), Workspace())

    private val frame: Flow<Frame> = combine(mode, focus, minutes, workspace) { mode, focus, now, ws ->
        val zone = viewerZone(ws.viewer)
        val today = now.toLocalDateTime(zone).date
        Frame(mode, today, focus?.let(LocalDate::parse) ?: today, zone)
    }.distinctUntilChanged()

    /** The loaded range only changes when the focused period (or the zone) does. */
    private val loadKeys: Flow<LoadKey> = frame
        .map { LoadKey(it.mode, AgendaPeriods.periodStart(it.mode, it.focus), it.zone) }
        .distinctUntilChanged()

    @Volatile
    private var lastWindow: TimeWindow? = null

    private val schedules: Flow<Map<LocalDate, DaySchedule>?> = loadKeys.flatMapLatest { key ->
        val days = AgendaPeriods.loadedDays(key.mode, key.start)
        val window = AgendaPeriods.windowOf(days, key.zone)
        lastWindow = window
        channelFlow<Map<LocalDate, DaySchedule>?> {
            // Fetch each newly shown window (and again when the screen comes
            // back); Realtime keeps it fresh in between. Failures fall back to
            // the cache silently — pull-to-refresh is the one that reports.
            launch { runCatchingNonCancel { data.refreshWindow(window) } }
            combine(data.observeOccurrences(window, key.zone), workspace) { occurrences, ws ->
                schedulesOf(occurrences, ws, days, key.zone)
            }.collect { send(it) }
        }
    }.onStart { emit(null) }

    val state: StateFlow<AgendaUiState> =
        combine(frame, schedules, minutes, refreshing, workspace) { frame, schedules, now, refreshing, ws ->
            AgendaUiState(
                mode = frame.mode,
                today = frame.today,
                focusDate = frame.focus,
                zone = frame.zone,
                now = now,
                schedules = schedules.orEmpty(),
                isLoaded = schedules != null,
                isRefreshing = refreshing,
                canCreate = ws.viewerId != null,
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), initialState())

    /**
     * Snackbar messages: results posted by the detail / editor screens plus
     * this screen's own. Plain confirmations respect the member's
     * `show_success_toasts`; anything offering Undo always shows.
     */
    val messages: Flow<AgendaNotice> = merge(
        notices.notices.filter { it.undo != null || workspace.value.viewer?.showSuccessToasts != false },
        ownNotices.receiveAsFlow(),
    )

    init {
        viewModelScope.launch { runCatchingNonCancel { data.refreshWorkspace() } }
        // A widget asked for a day: open it, now or as soon as this agenda exists.
        viewModelScope.launch {
            dayRequests.pending.filterNotNull().collect { date -> if (dayRequests.take(date)) openDay(date) }
        }
    }

    fun setMode(mode: AgendaMode) {
        savedState[KEY_MODE] = mode.name
    }

    fun next() = shiftBy(1)

    fun previous() = shiftBy(-1)

    fun goToToday() {
        savedState[KEY_FOCUS] = null
    }

    /** The pager settled on the period [offset] periods from today's. */
    fun showPeriod(offset: Int) {
        val current = state.value
        if (offset == current.periodOffset) return
        focusOn(AgendaPeriods.shiftedStart(current.mode, current.today, offset), current)
    }

    /** Opens [date] in the day view (from a week column header, "+N more", or a widget). */
    fun openDay(date: LocalDate) {
        savedState[KEY_MODE] = AgendaMode.Day.name
        focusOn(date, AgendaMode.Day, state.value.today)
    }

    /** Pull-to-refresh: refetch the workspace and the loaded window, reporting failure. */
    fun refresh() {
        if (refreshing.value) return
        viewModelScope.launch {
            refreshing.value = true
            try {
                data.refreshWorkspace()
                data.refreshWindow(lastWindow ?: defaultWindow())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ownNotices.send(AgendaNotice(UiText(R.string.agenda_refresh_failed)))
            } finally {
                refreshing.value = false
            }
        }
    }

    /** Runs a notice's Undo and reports how it went. */
    fun undo(notice: AgendaNotice) {
        val undo = notice.undo ?: return
        viewModelScope.launch {
            val ok = runCatchingNonCancel { undo() }
            ownNotices.send(AgendaNotice(UiText(if (ok) R.string.agenda_toast_undone else R.string.agenda_toast_couldnt_undo)))
        }
    }

    private fun shiftBy(periods: Int) {
        val current = state.value
        focusOn(AgendaPeriods.shiftedStart(current.mode, current.focusDate, periods), current)
    }

    private fun focusOn(date: LocalDate, current: AgendaUiState) = focusOn(date, current.mode, current.today)

    /**
     * Focuses [date] in [mode]; a period containing today focuses today itself,
     * so Day mode lands there. [mode] is passed rather than read from [state],
     * which lags a mode change made just before.
     */
    private fun focusOn(date: LocalDate, mode: AgendaMode, today: LocalDate) {
        val start = AgendaPeriods.periodStart(mode, date)
        val todayInPeriod = AgendaPeriods.periodStart(mode, today) == start
        savedState[KEY_FOCUS] = if (todayInPeriod) null else date.toString()
    }

    private fun initialState(): AgendaUiState {
        val zone = TimeZone.currentSystemDefault()
        val now = clock.now()
        val today = now.toLocalDateTime(zone).date
        val mode = AgendaMode.valueOf(savedState[KEY_MODE] ?: AgendaMode.Day.name)
        val focus = savedState.get<String>(KEY_FOCUS)?.let(LocalDate::parse) ?: today
        return AgendaUiState(mode = mode, today = today, focusDate = focus, zone = zone, now = now)
    }

    private fun defaultWindow(): TimeWindow {
        val s = state.value
        return AgendaPeriods.windowOf(AgendaPeriods.loadedDays(s.mode, AgendaPeriods.periodStart(s.mode, s.focusDate)), s.zone)
    }

    private fun schedulesOf(
        occurrences: List<Occurrence>,
        ws: Workspace,
        days: List<LocalDate>,
        zone: TimeZone,
    ): Map<LocalDate, DaySchedule> {
        val members = ws.members.associateBy { it.id }
        val categories = ws.categories.associateBy { it.id }
        val blocks = occurrences.map { agendaBlockOf(it, ws.viewerId, members, categories) }
        return scheduleDays(blocks, days, zone)
    }

    private data class Workspace(
        val members: List<Member> = emptyList(),
        val categories: List<Category> = emptyList(),
        val viewerId: String? = null,
    ) {
        val viewer: Member? get() = members.firstOrNull { it.id == viewerId }
    }

    private data class Frame(val mode: AgendaMode, val today: LocalDate, val focus: LocalDate, val zone: TimeZone)

    private data class LoadKey(val mode: AgendaMode, val start: LocalDate, val zone: TimeZone)

    private companion object {
        const val KEY_MODE = "agenda.mode"
        const val KEY_FOCUS = "agenda.focus"
        const val MINUTE_MS = 60_000L
        const val STOP_TIMEOUT_MS = 5_000L
    }
}

/** Runs [block], swallowing (but not hiding cancellation of) failures; true on success. */
internal suspend fun runCatchingNonCancel(block: suspend () -> Unit): Boolean = try {
    block()
    true
} catch (e: CancellationException) {
    throw e
} catch (_: Exception) {
    false
}
