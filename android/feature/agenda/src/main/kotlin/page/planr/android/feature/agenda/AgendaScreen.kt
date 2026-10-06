package page.planr.android.feature.agenda

import android.content.Context
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.atTime
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.component.PlanrFloatingButton
import page.planr.android.core.design.component.PlanrHaptics
import page.planr.android.core.design.component.rememberPlanrHaptics
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.agenda.model.AgendaMode
import page.planr.android.feature.agenda.model.AgendaNotice
import page.planr.android.feature.agenda.model.UiText
import page.planr.android.feature.agenda.sleep.SleepCheckin
import page.planr.android.feature.agenda.sleep.SleepCheckinViewModel
import page.planr.android.feature.agenda.ui.AgendaFormats
import page.planr.android.feature.agenda.ui.AgendaIcons
import page.planr.android.feature.agenda.ui.LocalAgendaMetrics
import page.planr.android.feature.agenda.ui.MonthPage
import page.planr.android.feature.agenda.ui.PartnerToggleButton
import page.planr.android.feature.agenda.ui.PeriodPage
import page.planr.android.feature.agenda.ui.gridHoursAt
import page.planr.android.feature.agenda.ui.rememberAgendaFormats
import page.planr.android.feature.agenda.ui.rememberAgendaMetrics
import page.planr.android.feature.agenda.ui.scrollOffsetFor

/**
 * Day / week / month agenda for both members: swipe or use the arrows between
 * periods, Today to come back, pull down to refresh.
 *
 * @param onOpenEvent opens an occurrence's detail. The argument is the
 *   occurrence key — the event id for a single event, `eventId:epochMs` for
 *   one instance of a series — which [EventDetailScreen] accepts as is.
 * @param onCreateEvent opens the new-event editor, seeded with a start time
 *   when a grid slot was tapped. When null the editor opens in place.
 * @param onQuickAdd shows a floating "Quick add" button when set (the host
 *   opens the Quick add sheet); the top bar's "+" still opens the full editor.
 * @param accountAction the host's account menu, at the end of the top bar.
 * @param todayRequests each emission goes back to today, as the Today button
 *   does (the host's bottom-bar tab tapped again).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgendaScreen(
    onOpenEvent: (eventId: String) -> Unit,
    modifier: Modifier = Modifier,
    onCreateEvent: ((start: Instant?) -> Unit)? = null,
    onQuickAdd: (() -> Unit)? = null,
    accountAction: (@Composable () -> Unit)? = null,
    todayRequests: Flow<Unit> = emptyFlow(),
    viewModel: AgendaViewModel = hiltViewModel(),
    sleepCheckin: SleepCheckinViewModel = hiltViewModel(),
) {
    // Without a create route, host the editor here (seed in epoch ms; MIN = no seed).
    var inlineCreate by rememberSaveable { mutableIntStateOf(0) }
    var inlineSeed by rememberSaveable { mutableLongStateOf(Long.MIN_VALUE) }
    if (onCreateEvent == null && inlineCreate > 0) {
        EventEditScreen(
            target = EventEditTarget.New(start = inlineSeed.takeIf { it != Long.MIN_VALUE }?.let(Instant::fromEpochMilliseconds)),
            onDone = { inlineCreate = 0 },
            modifier = modifier,
            viewModelKey = "agenda-create:$inlineCreate",
        )
        return
    }
    // Each in-place editor session counts up, so it gets a fresh ViewModel.
    var inlineSessions by rememberSaveable { mutableIntStateOf(0) }
    val create: (Instant?) -> Unit = onCreateEvent ?: { start ->
        inlineSeed = start?.toEpochMilliseconds() ?: Long.MIN_VALUE
        inlineSessions++
        inlineCreate = inlineSessions
    }

    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val undoLabel = stringResource(R.string.agenda_undo)
    val haptics = rememberPlanrHaptics()
    LaunchedEffect(viewModel, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            viewModel.messages.collect { notice -> showNotice(snackbar, notice, context, undoLabel, haptics, viewModel::undo) }
        }
    }
    LaunchedEffect(viewModel, todayRequests) { todayRequests.collect { viewModel.goToToday() } }

    val formats = rememberAgendaFormats()
    CompositionLocalProvider(LocalAgendaMetrics provides rememberAgendaMetrics()) {
        Scaffold(
            modifier = modifier,
            containerColor = MaterialTheme.colorScheme.background,
            snackbarHost = { SnackbarHost(snackbar) },
            floatingActionButton = {
                if (onQuickAdd != null && state.canCreate) {
                    PlanrFloatingButton(onClick = onQuickAdd) {
                        Icon(AgendaIcons.Plus, contentDescription = stringResource(R.string.agenda_quick_add))
                    }
                }
            },
            topBar = {
                AgendaTopBar(
                    state = state,
                    formats = formats,
                    onPrevious = viewModel::previous,
                    onNext = viewModel::next,
                    onToday = viewModel::goToToday,
                    onMode = viewModel::setMode,
                    onShowPartner = viewModel::setShowPartnerEvents,
                    onNew = if (state.canCreate) ({ create(null) }) else null,
                    accountAction = accountAction,
                )
            },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                SleepCheckin(
                    viewModel = sleepCheckin,
                    formats = formats,
                    modifier = Modifier.padding(start = PlanrSpacing.lg, end = PlanrSpacing.lg, bottom = PlanrSpacing.sm),
                )
                AgendaContent(state, formats, viewModel, sleepCheckin, onOpenEvent, create)
            }
        }
    }
}

/** The pager under pull-to-refresh, which also rereads the sleep check-in's nights. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ColumnScope.AgendaContent(
    state: AgendaUiState,
    formats: AgendaFormats,
    viewModel: AgendaViewModel,
    sleepCheckin: SleepCheckinViewModel,
    onOpenEvent: (eventId: String) -> Unit,
    create: (Instant?) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = {
            viewModel.refresh()
            sleepCheckin.refresh()
        },
        modifier = Modifier.fillMaxWidth().weight(1f),
    ) {
        AgendaPager(
            state = state,
            formats = formats,
            onSettled = viewModel::showPeriod,
            onOpenEvent = onOpenEvent,
            onOpenDay = viewModel::openDay,
            onCreateAt = if (state.canCreate) {
                { date, minute -> create(date.atTime(LocalTime(minute / 60, minute % 60)).toInstant(state.zone)) }
            } else {
                null
            },
        )
    }
}

/**
 * A virtually endless pager: page [CENTER_PAGE] is today's period. It follows
 * the ViewModel (arrows, Today) and reports where a swipe settles. The grid's
 * vertical position carries over between pages.
 */
@Composable
private fun AgendaPager(
    state: AgendaUiState,
    formats: AgendaFormats,
    onSettled: (Int) -> Unit,
    onOpenEvent: (String) -> Unit,
    onOpenDay: (LocalDate) -> Unit,
    onCreateAt: ((LocalDate, Int) -> Unit)?,
) {
    val hourPx = with(LocalDensity.current) { LocalAgendaMetrics.current.hourHeight.toPx() }
    val currentHourPx by rememberUpdatedState(hourPx)
    // Start near the current hour on today, else at 07:00. Kept in hours, not
    // pixels: a font-size change recreates the screen with a taller or shorter
    // hour, and the same pixel offset would land on a different time.
    var gridHours by rememberSaveable {
        val hour = state.now.toLocalDateTime(state.zone).hour - 1
        mutableFloatStateOf((if (state.periodOffset == 0) maxOf(hour, 0) else 7).toFloat())
    }
    key(state.mode) {
        val pager = rememberPagerState(initialPage = CENTER_PAGE + state.periodOffset) { PAGE_COUNT }
        LaunchedEffect(pager) {
            snapshotFlow { pager.settledPage }.collect { onSettled(it - CENTER_PAGE) }
        }
        LaunchedEffect(state.periodOffset) {
            val target = CENTER_PAGE + state.periodOffset
            if (pager.currentPage != target && !pager.isScrollInProgress) pager.animateScrollToPage(target)
        }
        HorizontalPager(state = pager, key = { it }, modifier = Modifier.fillMaxSize()) { page ->
            if (state.mode == AgendaMode.Month) {
                MonthPage(
                    month = state.periodStartAt(page - CENTER_PAGE),
                    schedule = state::schedule,
                    today = state.today,
                    formats = formats,
                    onOpenDay = onOpenDay,
                )
                return@HorizontalPager
            }
            val scroll = remember { ScrollState(scrollOffsetFor(gridHours, hourPx)) }
            LaunchedEffect(scroll) {
                snapshotFlow { scroll.value }.collect {
                    if (page == pager.settledPage) gridHours = gridHoursAt(it, currentHourPx)
                }
            }
            PeriodPage(
                days = state.daysAt(page - CENTER_PAGE),
                schedule = state::schedule,
                today = state.today,
                now = state.now,
                zone = state.zone,
                scrollState = scroll,
                formats = formats,
                onOpenBlock = { onOpenEvent(it.key) },
                onOpenDay = onOpenDay,
                onCreateAt = onCreateAt,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AgendaTopBar(
    state: AgendaUiState,
    formats: AgendaFormats,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    onMode: (AgendaMode) -> Unit,
    onShowPartner: (Boolean) -> Unit,
    onNew: (() -> Unit)?,
    accountAction: (@Composable () -> Unit)?,
) {
    val days = state.days
    val title = when (state.mode) {
        AgendaMode.Day -> formats.dayTitle(days.single(), state.today.year)
        AgendaMode.Week -> formats.rangeTitle(days.first(), days.last())
        AgendaMode.Month -> formats.monthTitle(state.periodStartAt(state.periodOffset))
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = PlanrSpacing.lg, vertical = PlanrSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .semantics { heading() },
            )
            state.partner?.let { partner -> PartnerToggleButton(partner, onToggle = onShowPartner) }
            if (onNew != null) {
                IconButton(onClick = onNew) {
                    Icon(AgendaIcons.Plus, contentDescription = stringResource(R.string.agenda_new_event))
                }
            }
            accountAction?.invoke()
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            SingleChoiceSegmentedButtonRow(Modifier.weight(1f, fill = false)) {
                AgendaMode.entries.forEachIndexed { index, mode ->
                    SegmentedButton(
                        selected = state.mode == mode,
                        onClick = { onMode(mode) },
                        shape = SegmentedButtonDefaults.itemShape(index, AgendaMode.entries.size),
                        icon = {},
                        label = {
                            Text(
                                stringResource(
                                    when (mode) {
                                        AgendaMode.Day -> R.string.agenda_view_day
                                        AgendaMode.Week -> R.string.agenda_view_week
                                        AgendaMode.Month -> R.string.agenda_view_month
                                    },
                                ),
                                maxLines = 1,
                            )
                        },
                    )
                }
            }
            Row(
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f),
            ) {
                IconButton(onClick = onPrevious) {
                    Icon(AgendaIcons.ChevronLeft, contentDescription = stringResource(R.string.agenda_previous), modifier = Modifier.size(20.dp))
                }
                OutlinedButton(onClick = onToday, enabled = state.periodOffset != 0) {
                    Text(stringResource(R.string.agenda_today), maxLines = 1)
                }
                IconButton(onClick = onNext) {
                    Icon(AgendaIcons.ChevronRight, contentDescription = stringResource(R.string.agenda_next), modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

private suspend fun showNotice(
    host: SnackbarHostState,
    notice: AgendaNotice,
    context: Context,
    undoLabel: String,
    haptics: PlanrHaptics,
    onUndo: (AgendaNotice) -> Unit,
) {
    if (notice.failedWrite) haptics.reject()
    val result = host.showSnackbar(
        message = notice.message.resolve(context),
        actionLabel = if (notice.undo != null) undoLabel else null,
        duration = if (notice.undo != null) SnackbarDuration.Long else SnackbarDuration.Short,
    )
    if (result == SnackbarResult.ActionPerformed) {
        haptics.tick()
        onUndo(notice)
    }
}

internal fun UiText.resolve(context: Context): String {
    val count = quantity
    return if (count != null) {
        context.resources.getQuantityString(id, count, *args.toTypedArray())
    } else {
        context.getString(id, *args.toTypedArray())
    }
}

/** Pages either side of today's period; far more than anyone swipes. */
private const val PAGE_COUNT = 20_000
private const val CENTER_PAGE = PAGE_COUNT / 2
