package page.planr.android.feature.insights

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.datetime.LocalDate
import kotlinx.datetime.toKotlinLocalDate
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.feature.insights.model.TabEnv
import page.planr.android.feature.insights.overview.OverviewTab
import page.planr.android.feature.insights.patterns.PatternsTab
import page.planr.android.feature.insights.shell.ClampBanner
import page.planr.android.feature.insights.shell.CustomRangeDialog
import page.planr.android.feature.insights.shell.FiltersSheet
import page.planr.android.feature.insights.shell.InsightsSkeleton
import page.planr.android.feature.insights.shell.InsightsTabRow
import page.planr.android.feature.insights.shell.LoadError
import page.planr.android.feature.insights.shell.PeriodBar
import page.planr.android.feature.insights.shell.RefreshFailedBanner
import page.planr.android.feature.insights.shell.periodLabel
import page.planr.android.feature.insights.tasks.TasksTab
import page.planr.android.feature.insights.trends.TrendsTab
import page.planr.android.feature.insights.ui.components.DayDetailSheet

/**
 * The Insights screen. Only the header row and the tab row are pinned (about
 * 104 dp); the period bar and the banners lead each tab's list and scroll
 * with it. Pull down to refresh; the day sheet's "Open in calendar" hands the
 * date to the host.
 *
 * @param onOpenDay shows a day in the agenda.
 * @param onOpenAgenda / onOpenTasks back the empty states' calls to action.
 * @param accountAction the host's account menu, beside the title.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InsightsScreen(
    onOpenDay: (LocalDate) -> Unit,
    onOpenAgenda: () -> Unit,
    onOpenTasks: () -> Unit,
    accountAction: (@Composable () -> Unit)?,
    modifier: Modifier = Modifier,
    viewModel: InsightsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // The owner is the back-stack entry, so coming back to the tab counts as a resume.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.onResume() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(viewModel, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                delay(ROLLOVER_CHECK_MS)
                viewModel.checkRollover()
            }
        }
    }

    var filtersOpen by rememberSaveable { mutableStateOf(false) }
    var rangeOpen by rememberSaveable { mutableStateOf(false) }

    Scaffold(modifier = modifier, containerColor = MaterialTheme.colorScheme.background) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            InsightsHeader(
                activeFilters = state.filters.activeCount,
                onFilters = { filtersOpen = true },
                accountAction = accountAction,
            )
            InsightsTabRow(selected = state.tab, onSelect = viewModel::selectTab)
            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                InsightsContent(
                    state = state,
                    viewModel = viewModel,
                    onOpenAgenda = onOpenAgenda,
                    onOpenTasks = onOpenTasks,
                    onEditCustom = { rangeOpen = true },
                )
            }
        }
    }

    val zone = state.zone
    val dayDetail = state.dayDetail
    if (dayDetail != null && zone != null) {
        DayDetailSheet(
            model = dayDetail,
            categories = state.categories,
            zone = zone,
            onDismiss = viewModel::closeDay,
            onOpenInCalendar = { date ->
                viewModel.closeDay()
                onOpenDay(date.toKotlinLocalDate())
            },
        )
    }
    if (filtersOpen) {
        FiltersSheet(
            filters = state.filters,
            onCategoryHidden = viewModel::setCategoryHidden,
            onIncludeInactive = viewModel::setIncludeInactive,
            onDismiss = { filtersOpen = false },
        )
    }
    // Shown once the custom range is applied, so it opens on the stored (seeded or restored) range.
    val period = state.period
    if (rangeOpen && period?.preset == PeriodPreset.Custom) {
        CustomRangeDialog(
            first = period.firstDay,
            last = period.lastDay,
            onApply = { first, last ->
                rangeOpen = false
                viewModel.setCustomRange(first, last)
            },
            onDismiss = { rangeOpen = false },
        )
    }
}

/** Title, the filters trigger (a neutral count badge when any filter is on) and the account menu. */
@Composable
private fun InsightsHeader(activeFilters: Int, onFilters: () -> Unit, accountAction: (@Composable () -> Unit)?) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.insights_shell_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.lg)
                .semantics { heading() },
        )
        val description = if (activeFilters > 0) {
            pluralStringResource(R.plurals.insights_filters_trigger_count, activeFilters, activeFilters)
        } else {
            stringResource(R.string.insights_filters_trigger)
        }
        IconButton(onClick = onFilters) {
            BadgedBox(
                badge = {
                    if (activeFilters > 0) {
                        // Secondary, like the web's badge: Material's default error red would read as a warning.
                        Badge(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.clearAndSetSemantics {},
                        ) {
                            Text(activeFilters.toString(), style = LocalTextStyle.current.copy(fontFeatureSettings = TABULAR_NUMS))
                        }
                    }
                },
            ) {
                Icon(painterResource(R.drawable.ic_insights_filters), contentDescription = description)
            }
        }
        Box(Modifier.padding(end = PlanrSpacing.sm)) { accountAction?.invoke() }
    }
}

/**
 * The active tab's list, or the shell's own list while loading or failed. Each
 * tab keeps its own saved state (scroll position) across tab switches.
 */
@Composable
private fun InsightsContent(
    state: InsightsUiState,
    viewModel: InsightsViewModel,
    onOpenAgenda: () -> Unit,
    onOpenTasks: () -> Unit,
    onEditCustom: () -> Unit,
) {
    val period = state.period
    val zone = state.zone
    val header: @Composable () -> Unit = {
        if (period != null && zone != null) {
            Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md)) {
                PeriodBar(
                    period = period,
                    zone = zone,
                    onPreset = { preset ->
                        viewModel.selectPreset(preset)
                        if (preset == PeriodPreset.Custom) onEditCustom()
                    },
                    onGranularity = viewModel::selectGranularity,
                    onEditCustom = onEditCustom,
                )
                if (period.clamped) ClampBanner()
                if (state.refreshFailed && state.content !is TabContent.Failed) {
                    RefreshFailedBanner(onRetry = viewModel::refresh)
                }
            }
        }
    }
    val env = if (period != null && zone != null) {
        TabEnv(
            zone = zone,
            categories = state.categories,
            preset = period.preset,
            periodLabel = periodLabel(period, zone),
            now = state.now,
            window = period.window,
        )
    } else {
        null
    }

    val saveable = rememberSaveableStateHolder()
    saveable.SaveableStateProvider(state.tab.name) {
        when (val content = state.content) {
            TabContent.Loading -> StatusList(header) { InsightsSkeleton() }
            is TabContent.Failed -> StatusList(header) { LoadError(onRetry = viewModel::retry) }
            is TabContent.Overview -> if (env != null) {
                OverviewTab(
                    model = content.model,
                    env = env,
                    header = header,
                    showComparison = state.showComparison,
                    onToggleComparison = viewModel::toggleComparison,
                    onOpenDay = viewModel::openDay,
                    onOpenAgenda = onOpenAgenda,
                )
            }
            is TabContent.Trends -> if (env != null) {
                TrendsTab(
                    model = content.model,
                    env = env,
                    header = header,
                    hiddenSeries = state.hiddenTrendSeries,
                    onToggleSeries = viewModel::toggleTrendSeries,
                    onOpenDay = viewModel::openDay,
                    onOpenAgenda = onOpenAgenda,
                )
            }
            is TabContent.Patterns -> if (env != null) {
                PatternsTab(model = content.model, env = env, header = header, onOpenAgenda = onOpenAgenda)
            }
            is TabContent.Tasks -> if (env != null) {
                TasksTab(model = content.model, env = env, header = header, onOpenTasks = onOpenTasks)
            }
        }
    }
}

/** The header, then a loading or error block, in the same list geometry as the tabs. */
@Composable
private fun StatusList(header: @Composable () -> Unit, content: @Composable () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
    ) {
        item(key = "header") { header() }
        item(key = "status") { content() }
    }
}

/** How often the date rollover is checked while the screen is resumed. */
private const val ROLLOVER_CHECK_MS = 60_000L
