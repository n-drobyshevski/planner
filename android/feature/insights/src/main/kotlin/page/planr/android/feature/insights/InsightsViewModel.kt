package page.planr.android.feature.insights

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.Collator
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaZoneId
import page.planr.android.core.data.prefs.InsightsFilterPrefs
import page.planr.android.core.insights.filter.InsightsFilter
import page.planr.android.core.insights.filter.InsightsFilters
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.toTimeWindow
import page.planr.android.core.insights.period.Periods
import page.planr.android.core.model.Category
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task
import page.planr.android.core.model.viewerTimeZone
import page.planr.android.feature.insights.data.InsightsDataSource
import page.planr.android.feature.insights.di.InsightsCompute
import page.planr.android.feature.insights.model.InsightsInputs
import page.planr.android.feature.insights.model.InsightsModelFactory

/**
 * The Insights shell: period, tab and filters, the Room reads behind them, and
 * the active tab's model (insights-shell.tsx).
 *
 * Everything that reads Room or computes runs only as the upstream of [state]
 * (`WhileSubscribed`), because the Insights back stack outlives the tab: off
 * screen, Realtime edits cost nothing. Refresh bookkeeping lives in fields, so
 * it survives resubscription: a period's union window `[prev.start, cur.end)`
 * is fetched once per viewer, and resume refreshes only the current window.
 * The last viewer and model are kept too, so coming back shows them at once
 * (no skeleton, no lost scroll position) while the upstream restarts. All of
 * it is forgotten when the signed-in member changes: sign-out wipes Room.
 * Tab and period survive process death through [SavedStateHandle]; the
 * comparison ghost and the Trends legend are session state.
 */
@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class InsightsViewModel @Inject constructor(
    private val data: InsightsDataSource,
    private val models: InsightsModelFactory,
    private val clock: Clock,
    private val savedState: SavedStateHandle,
    @InsightsCompute private val compute: CoroutineDispatcher,
) : ViewModel() {

    private val tab: Flow<InsightsTab> =
        savedState.getStateFlow(KEY_TAB, InsightsTab.Overview.name).map(::tabOf).distinctUntilChanged()

    private val periodState: Flow<PeriodState> = combine(
        savedState.getStateFlow(KEY_PRESET, PeriodPreset.ThisWeek.id),
        savedState.getStateFlow<Long?>(KEY_CUSTOM_FROM, null),
        savedState.getStateFlow<Long?>(KEY_CUSTOM_TO, null),
        savedState.getStateFlow(KEY_GRANULARITY, Granularity.Day.id),
    ) { preset, from, to, granularity -> periodStateOf(preset, from, to, granularity) }.distinctUntilChanged()

    /**
     * The anchor every period resolves against: set to wall time on each
     * period change and moved by [checkRollover] only when the local date
     * changes (insights-shell.tsx `setNow`). Not a ticking clock.
     */
    private val now = MutableStateFlow(clock.now().toEpochMilliseconds())

    /** Signed-in viewer and zone; null until their member row (and zone) is known. */
    private val viewer: Flow<Viewer?> = data.currentMemberId.distinctUntilChanged().flatMapLatest { id ->
        if (id == null) flowOf(null) else viewerOf(id)
    }.distinctUntilChanged().onEach { if (it != null) lastViewer = it }

    /** The resolved period for the viewer; shared by every branch below. */
    private val frame: Flow<Frame?> = combine(viewer, periodState, now) { v, s, n ->
        v?.let { Frame(it.id, it.zone, it.timeZone, s, n, Periods.resolve(s, it.zone, n)) }
    }
        .distinctUntilChanged()
        .onEach { latestFrame = it ?: latestFrame }
        .shareIn(viewModelScope, SharingStarted.WhileSubscribed(0, 0), replay = 1)

    private val filterPrefs: Flow<InsightsFilterPrefs> = frame.map { it?.viewerId }.distinctUntilChanged()
        .flatMapLatest { id -> if (id == null) flowOf(InsightsFilterPrefs()) else data.observeFilters(id) }

    /** The current and previous windows, read separately (as the web fetches them), debounced. */
    private val occurrences: Flow<Occurrences?> = frame
        .map { f -> f?.let { Windows(it.period.window, it.period.prevWindow, it.timeZone) } }
        .distinctUntilChanged()
        .flatMapLatest { w ->
            if (w == null) {
                flowOf(null)
            } else {
                combine(
                    data.observeOccurrences(w.current.toTimeWindow(), w.timeZone),
                    data.observeOccurrences(w.previous.toTimeWindow(), w.timeZone),
                ) { current, previous -> Occurrences(w, current, previous) }
            }
        }
        .debounce(RECOMPUTE_DEBOUNCE_MS)
        .distinctUntilChanged()

    /** One filtered snapshot per change, built on [compute]; skipped while the windows lag the period. */
    private val snapshots: Flow<Snapshot> = combine(
        frame,
        occurrences,
        data.observeTasks(),
        data.observeCategories(),
        filterPrefs,
    ) { f, occ, tasks, categories, prefs -> Raw(f, occ, tasks, categories, prefs) }
        .transformLatest { raw ->
            val f = raw.frame ?: return@transformLatest
            val occ = raw.occurrences ?: return@transformLatest
            if (occ.windows.current != f.period.window || occ.windows.previous != f.period.prevWindow) return@transformLatest
            emit(withContext(compute) { snapshotOf(f, occ, raw.tasks, raw.categories, raw.prefs) })
        }
        .onEach { latestInputs = it.inputs }

    /** Only the active tab is computed. */
    private val computed: Flow<Computed> = combine(snapshots, tab) { s, t -> s to t }
        .mapLatest { (s, t) ->
            val content = withContext(compute) { contentOf(s.inputs, t) }
            Computed(s.inputs.viewerId, s.inputs.period, t, content, s.currentCached)
        }
        .onEach { lastComputed = it }

    /**
     * Fetches each new union window once, 300 ms after the period settles.
     * Signed out the key is null, so signing back in to the same period
     * counts as a new key (the bookkeeping was reset meanwhile).
     */
    private val unionRefresh: Flow<UnionKey?> = frame
        .map { f -> f?.period?.let { UnionKey(Periods.unionWindow(it), it.window) } }
        .distinctUntilChanged()
        .debounce(UNION_DEBOUNCE_MS)
        .onEach { key -> if (key != null && key.union != lastUnionOk) refreshUnion(key.union, key.current) }

    private val unionFetch = MutableStateFlow<Map<MsWindow, Fetch>>(emptyMap())
    private val refreshing = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)
    private val showComparison = MutableStateFlow(false)
    private val hiddenTrendSeries = MutableStateFlow<Set<String>>(emptySet())
    private val dayDetail = MutableStateFlow<DayDetailModel?>(null)

    // Refresh bookkeeping (survives resubscription; touched on the main thread only).
    private var lastUnionOk: MsWindow? = null
    private var lastCurrentOk: Pair<MsWindow, Long>? = null
    private val inFlight = HashMap<MsWindow, Deferred<Boolean>>()

    /** Bumped by [forgetViewer]; a refresh started under an older generation records nothing. */
    private var generation = 0

    // What the screen showed last, replayed when it resubscribes (see the class comment).
    @Volatile
    private var lastViewer: Viewer? = null

    @Volatile
    private var lastComputed: Computed? = null

    @Volatile
    private var latestFrame: Frame? = null

    @Volatile
    private var latestInputs: InsightsInputs? = null

    private var dayJob: Job? = null
    private val filterWrites = Mutex()

    private val shell: Flow<Shell> = combine(frame, tab, computed.onStart<Computed?> { emit(lastComputed) }, unionFetch) { f, t, c, fetches ->
        Shell(f, t, contentFor(f, t, c, fetches))
    }

    private val reference: Flow<Reference> = combine(data.observeCategories(), filterPrefs) { categories, prefs ->
        Reference(
            filters = FiltersUi(
                categories = categories.map { FilterCategory(it.id, it.name, it.color, hidden = it.id in prefs.hiddenCategoryIds) },
                includeInactive = prefs.includeInactive,
            ),
            categories = categories.associateByTo(LinkedHashMap()) { it.id },
        )
    }

    private val session: Flow<Session> = combine(
        refreshing,
        refreshFailed,
        showComparison,
        hiddenTrendSeries,
        dayDetail,
    ) { isRefreshing, failed, comparison, hidden, day -> Session(isRefreshing, failed, comparison, hidden, day) }

    val state: StateFlow<InsightsUiState> = channelFlow {
        launch { unionRefresh.collect {} }
        combine(shell, reference, session) { s, r, x -> uiStateOf(s, r, x) }.collect { send(it) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), InsightsUiState(tab = savedTab()))

    init {
        // Watched even off screen (it is not Room): a sign-out while this back
        // stack is saved must still invalidate what it believes is cached.
        viewModelScope.launch {
            var bound: String? = null
            data.currentMemberId.distinctUntilChanged().collect { id ->
                if (id != bound) {
                    if (bound != null) forgetViewer()
                    bound = id
                }
            }
        }
    }

    fun selectTab(tab: InsightsTab) {
        savedState[KEY_TAB] = tab.name
    }

    /**
     * period-selector.tsx `changePreset`: keeps any stored custom bounds (so
     * Custom → Last week → Custom restores them); Custom without bounds seeds
     * them from the visible window and applies at once.
     */
    fun selectPreset(preset: PeriodPreset) {
        if (preset == PeriodPreset.Custom) {
            val window = currentPeriod()?.window
            if (window != null) {
                if (savedState.get<Long>(KEY_CUSTOM_FROM) == null) savedState[KEY_CUSTOM_FROM] = window.start
                if (savedState.get<Long>(KEY_CUSTOM_TO) == null) savedState[KEY_CUSTOM_TO] = window.end - 1 // exclusive → last day
            }
        }
        savedState[KEY_PRESET] = preset.id
        touchNow()
    }

    /** Stores [first]..[last] at local noon (unambiguous across DST); resolve swaps and clamps. */
    fun setCustomRange(first: LocalDate, last: LocalDate) {
        val zone = latestFrame?.zone ?: return
        savedState[KEY_CUSTOM_FROM] = noon(first, zone)
        savedState[KEY_CUSTOM_TO] = noon(last, zone)
        savedState[KEY_PRESET] = PeriodPreset.Custom.id
        touchNow()
    }

    /** Stores the requested granularity even when the window does not offer it; resolve sanitizes. */
    fun selectGranularity(g: Granularity) {
        savedState[KEY_GRANULARITY] = g.id
        touchNow()
    }

    fun setCategoryHidden(categoryId: String, hidden: Boolean) {
        val viewerId = latestFrame?.viewerId ?: return
        viewModelScope.launch {
            runCatchingNonCancel {
                filterWrites.withLock {
                    val current = data.observeFilters(viewerId).first().hiddenCategoryIds
                    data.setHiddenCategories(viewerId, if (hidden) current + categoryId else current - categoryId)
                }
            }
        }
    }

    fun setIncludeInactive(include: Boolean) {
        val viewerId = latestFrame?.viewerId ?: return
        viewModelScope.launch {
            runCatchingNonCancel { filterWrites.withLock { data.setIncludeInactive(viewerId, include) } }
        }
    }

    fun toggleComparison() {
        showComparison.update { !it }
    }

    fun toggleTrendSeries(key: String) {
        hiddenTrendSeries.update { if (key in it) it - key else it + key }
    }

    /** Opens the day sheet over the current filtered spans. */
    fun openDay(dayMs: Long) {
        val inputs = latestInputs ?: return
        dayJob?.cancel()
        dayJob = viewModelScope.launch {
            val titleOrder: Comparator<in String> = Collator.getInstance(Locale.getDefault())
            dayDetail.value = withContext(compute) { models.dayDetail(inputs, dayMs, titleOrder) }
        }
    }

    fun closeDay() {
        dayJob?.cancel()
        dayDetail.value = null
    }

    /** Pull-to-refresh: the union window and the reference data together, reporting failure. */
    fun refresh() {
        if (refreshing.value) return
        val period = currentPeriod() ?: return
        val union = Periods.unionWindow(period)
        val started = generation
        viewModelScope.launch {
            refreshing.value = true
            try {
                val (windowOk, referenceOk) = coroutineScope {
                    val window = fetch(union, force = true)
                    val reference = async { runCatchingNonCancel { data.refreshReference() } }
                    window.await() to reference.await()
                }
                if (started != generation) return@launch
                if (windowOk) onUnionRefreshed(union, period.window)
                refreshFailed.value = !(windowOk && referenceOk)
            } finally {
                refreshing.value = false
            }
        }
    }

    /** From the Failed state: fetch the union again (Loading while it runs). */
    fun retry() {
        val period = currentPeriod() ?: return
        refreshFailed.value = false
        refreshUnion(Periods.unionWindow(period), period.window)
    }

    /**
     * Back on screen: roll the date over, then refresh the CURRENT window when
     * its last refresh is older than 30 s. The union is left alone; it is
     * fetched on a period change (or retried on resubscription when it failed).
     */
    fun onResume() {
        checkRollover()
        val period = currentPeriod() ?: return
        if (Periods.unionWindow(period) != lastUnionOk) return
        val wall = clock.now().toEpochMilliseconds()
        val last = lastCurrentOk
        if (last != null && last.first == period.window && wall - last.second < RESUME_REFRESH_MS) return
        val started = generation
        viewModelScope.launch {
            val ok = fetch(period.window).await()
            if (ok && started == generation) lastCurrentOk = period.window to clock.now().toEpochMilliseconds()
        }
    }

    /** Moves [now] forward when the local date has changed (insights-shell.tsx rollover). */
    fun checkRollover() {
        val zone = latestFrame?.zone ?: return
        val wall = clock.now().toEpochMilliseconds()
        if (Periods.localDate(wall, zone) != Periods.localDate(now.value, zone)) now.value = wall
    }

    private fun touchNow() {
        now.value = clock.now().toEpochMilliseconds()
    }

    /** The period as of right now (saved state and [now] are current even before [frame] catches up). */
    private fun currentPeriod(): ResolvedPeriod? {
        val zone = latestFrame?.zone ?: return null
        return Periods.resolve(savedPeriodState(), zone, now.value)
    }

    private fun refreshUnion(union: MsWindow, current: MsWindow) {
        unionFetch.update { if (it[union] == Fetch.Ok) it else it + (union to Fetch.InFlight) }
        val started = generation
        viewModelScope.launch {
            val ok = fetch(union).await()
            if (started != generation) return@launch
            if (ok) {
                onUnionRefreshed(union, current)
            } else {
                unionFetch.update { if (it[union] == Fetch.Ok) it else it + (union to Fetch.Failed) }
            }
        }
    }

    private fun onUnionRefreshed(union: MsWindow, current: MsWindow) {
        lastUnionOk = union
        lastCurrentOk = current to clock.now().toEpochMilliseconds()
        unionFetch.update { it + (union to Fetch.Ok) }
        refreshFailed.value = false
    }

    /**
     * The signed-in member changed (signed out, or another member): Room was
     * wiped or holds someone else's rows, so nothing fetched or computed for
     * the previous viewer counts any more. The next subscription starts from
     * Loading and fetches the union again.
     */
    private fun forgetViewer() {
        generation++
        lastUnionOk = null
        lastCurrentOk = null
        inFlight.clear()
        unionFetch.value = emptyMap()
        refreshFailed.value = false
        lastViewer = null
        lastComputed = null
        latestInputs = null
        closeDay()
    }

    /**
     * Refreshes [window] into Room, joining a refresh of the same window that
     * is already running. Runs in viewModelScope, so leaving the screen does
     * not cancel a nearly finished write. Never throws: false on failure.
     * Only pull-to-refresh [force]s past the repository's freshness window.
     */
    private fun fetch(window: MsWindow, force: Boolean = false): Deferred<Boolean> {
        inFlight[window]?.takeIf { it.isActive }?.let { return it }
        return viewModelScope.async { runCatchingNonCancel { data.refreshWindow(window.toTimeWindow(), force) } }
            .also { inFlight[window] = it }
    }

    private fun viewerOf(id: String): Flow<Viewer?> = flow {
        val rows = data.observeMembers().map { members -> members.firstOrNull { it.id == id } }
        val known = lastViewer?.takeIf { it.id == id }
        if (known != null) {
            // Back on screen: resolve in the zone already known; the row follows.
            emit(known)
        } else {
            emit(null)
            // Wait for the member row so the first period resolves in the member's
            // zone, not the device's; offline with an empty cache, fall back.
            if (withTimeoutOrNull(MEMBER_WAIT_MS) { rows.filterNotNull().first() } == null) {
                emit(Viewer(id, viewerTimeZone(null)))
            }
        }
        emitAll(rows.filterNotNull().map { Viewer(id, viewerTimeZone(it)) })
    }

    private fun snapshotOf(
        f: Frame,
        occ: Occurrences,
        tasks: List<Task>,
        categories: List<Category>,
        prefs: InsightsFilterPrefs,
    ): Snapshot {
        val filter = InsightsFilter(f.viewerId, prefs.hiddenCategoryIds, prefs.includeInactive)
        val inputs = InsightsInputs(
            viewerId = f.viewerId,
            zone = f.zone,
            now = f.now,
            state = f.state,
            period = f.period,
            spans = InsightsFilters.filterForInsights(occ.current.map(Span::of), filter),
            prevSpans = InsightsFilters.filterForInsights(occ.previous.map(Span::of), filter),
            tasks = InsightsFilters.viewerTasks(tasks.map(InsightTask::of), f.viewerId),
            categories = categories.associateByTo(LinkedHashMap()) { it.id },
        )
        return Snapshot(inputs, currentCached = occ.current.isNotEmpty())
    }

    private fun contentOf(inputs: InsightsInputs, tab: InsightsTab): TabContent = when (tab) {
        InsightsTab.Overview -> TabContent.Overview(models.overview(inputs))
        InsightsTab.Trends -> TabContent.Trends(models.trends(inputs))
        InsightsTab.Patterns -> TabContent.Patterns(models.patterns(inputs))
        InsightsTab.Tasks -> TabContent.Tasks(models.tasks(inputs))
        InsightsTab.Sleep -> TabContent.Sleep
    }

    /**
     * Loading until the model for the current (period, tab) exists AND either
     * the union's refresh has settled or the current window has cached rows,
     * so the empty state never flashes before network data lands. A failed
     * refresh over an empty cache is [TabContent.Failed].
     */
    private fun contentFor(f: Frame?, tab: InsightsTab, c: Computed?, fetches: Map<MsWindow, Fetch>): TabContent {
        if (f == null || c == null || c.viewerId != f.viewerId || c.period != f.period || c.tab != tab) return TabContent.Loading
        val fetch = fetches[Periods.unionWindow(f.period)]
        return when {
            fetch == Fetch.Failed && !c.currentCached -> TabContent.Failed()
            fetch == Fetch.Ok || fetch == Fetch.Failed || c.currentCached -> c.content
            else -> TabContent.Loading
        }
    }

    private fun uiStateOf(shell: Shell, reference: Reference, session: Session): InsightsUiState {
        val f = shell.frame
        return InsightsUiState(
            tab = shell.tab,
            period = f?.let(::periodUiOf),
            zone = f?.zone,
            now = f?.now ?: 0L,
            filters = reference.filters,
            content = shell.content,
            isRefreshing = session.isRefreshing,
            // A failed first load over an empty cache is reported (as Failed); other background failures stay silent.
            refreshFailed = session.refreshFailed || shell.content is TabContent.Failed,
            showComparison = session.showComparison,
            hiddenTrendSeries = session.hiddenTrendSeries,
            dayDetail = session.dayDetail,
            categories = reference.categories,
        )
    }

    private fun periodUiOf(f: Frame): PeriodUi {
        val p = f.period
        return PeriodUi(
            preset = f.state.preset,
            requestedGranularity = f.state.granularity,
            granularity = p.granularity,
            choices = Periods.granularityChoices(p.window),
            window = p.window,
            firstDay = Periods.localDate(p.window.start, f.zone),
            lastDay = Periods.localDate(p.window.end - 1, f.zone),
            clamped = p.clamped,
        )
    }

    private fun savedTab(): InsightsTab = tabOf(savedState[KEY_TAB] ?: InsightsTab.Overview.name)

    private fun savedPeriodState(): PeriodState = periodStateOf(
        savedState[KEY_PRESET] ?: PeriodPreset.ThisWeek.id,
        savedState[KEY_CUSTOM_FROM],
        savedState[KEY_CUSTOM_TO],
        savedState[KEY_GRANULARITY] ?: Granularity.Day.id,
    )

    private data class Viewer(val id: String, val timeZone: TimeZone) {
        val zone: ZoneId = timeZone.toJavaZoneId()
    }

    private data class Frame(
        val viewerId: String,
        val zone: ZoneId,
        val timeZone: TimeZone,
        val state: PeriodState,
        val now: Long,
        val period: ResolvedPeriod,
    )

    private data class Windows(val current: MsWindow, val previous: MsWindow, val timeZone: TimeZone)

    private data class Occurrences(val windows: Windows, val current: List<Occurrence>, val previous: List<Occurrence>)

    private data class Raw(
        val frame: Frame?,
        val occurrences: Occurrences?,
        val tasks: List<Task>,
        val categories: List<Category>,
        val prefs: InsightsFilterPrefs,
    )

    private data class Snapshot(val inputs: InsightsInputs, val currentCached: Boolean)

    private data class Computed(
        val viewerId: String,
        val period: ResolvedPeriod,
        val tab: InsightsTab,
        val content: TabContent,
        val currentCached: Boolean,
    )

    private data class UnionKey(val union: MsWindow, val current: MsWindow)

    private data class Shell(val frame: Frame?, val tab: InsightsTab, val content: TabContent)

    private data class Reference(val filters: FiltersUi, val categories: Map<String, Category>)

    private data class Session(
        val isRefreshing: Boolean,
        val refreshFailed: Boolean,
        val showComparison: Boolean,
        val hiddenTrendSeries: Set<String>,
        val dayDetail: DayDetailModel?,
    )

    /** Where a union window's refresh stands; Ok sticks once reached. */
    private enum class Fetch { InFlight, Ok, Failed }

    internal companion object {
        const val KEY_TAB = "insights.tab"
        const val KEY_PRESET = "insights.preset"
        const val KEY_CUSTOM_FROM = "insights.customFrom"
        const val KEY_CUSTOM_TO = "insights.customTo"
        const val KEY_GRANULARITY = "insights.granularity"

        const val STOP_TIMEOUT_MS = 5_000L
        const val UNION_DEBOUNCE_MS = 300L
        const val RECOMPUTE_DEBOUNCE_MS = 150L
        const val RESUME_REFRESH_MS = 30_000L

        /** How long to wait for the viewer's member row before resolving in the device zone. */
        const val MEMBER_WAIT_MS = 5_000L

        /** Unknown stored values fall back to the defaults, so a stale saved state never crashes. */
        fun tabOf(name: String): InsightsTab = InsightsTab.entries.firstOrNull { it.name == name } ?: InsightsTab.Overview

        fun periodStateOf(preset: String, from: Long?, to: Long?, granularity: String): PeriodState = PeriodState(
            preset = PeriodPreset.fromId(preset) ?: PeriodPreset.ThisWeek,
            customFrom = from,
            customTo = to,
            granularity = Granularity.fromId(granularity) ?: Granularity.Day,
        )

        fun noon(date: LocalDate, zone: ZoneId): Long = date.atTime(12, 0).atZone(zone).toInstant().toEpochMilli()

        /** Runs [block]; false when it threw (cancellation still propagates). */
        private inline fun runCatchingNonCancel(block: () -> Unit): Boolean = try {
            block()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }
    }
}
