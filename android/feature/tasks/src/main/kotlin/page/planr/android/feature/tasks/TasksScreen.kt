package page.planr.android.feature.tasks

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.component.PlanrFloatingButton
import page.planr.android.core.design.component.rememberPlanrHaptics
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.feature.tasks.list.TasksNotice
import page.planr.android.feature.tasks.list.TasksUiState
import page.planr.android.feature.tasks.list.TasksViewModel
import page.planr.android.feature.tasks.model.TaskFilters
import page.planr.android.feature.tasks.model.TaskGroup
import page.planr.android.feature.tasks.model.TaskGroupKey
import page.planr.android.feature.tasks.model.TaskScope
import page.planr.android.feature.tasks.model.TaskStateFilter
import page.planr.android.feature.tasks.ui.TaskCard
import page.planr.android.feature.tasks.ui.groupLabel

/**
 * The tasks list: whose-tasks and state filters, then open tasks grouped by
 * due date (Overdue / This week / Later / No date) and a Done section. The
 * checkbox completes or reopens (owner only); tapping a row opens it.
 *
 * @param onNewTask shows a "New task" button when set (the host opens Quick add).
 * @param accountAction the host's account menu, beside the title.
 * @param scrollToTopRequests each emission scrolls the list to the top (the
 *   host's bottom-bar tab tapped again).
 */
@Composable
fun TasksScreen(
    onOpenTask: (taskId: String) -> Unit,
    modifier: Modifier = Modifier,
    onNewTask: (() -> Unit)? = null,
    accountAction: (@Composable () -> Unit)? = null,
    scrollToTopRequests: Flow<Unit> = emptyFlow(),
    viewModel: TasksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    NoticeEffect(state.notice, snackbar, viewModel)
    val listState = rememberLazyListState()
    LaunchedEffect(scrollToTopRequests) {
        scrollToTopRequests.collect { if (listState.layoutInfo.totalItemsCount > 0) listState.animateScrollToItem(0) }
    }

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (onNewTask != null) {
                PlanrFloatingButton(onClick = onNewTask) {
                    Icon(painterResource(R.drawable.ic_task_add), contentDescription = stringResource(R.string.tasks_new_task))
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.tasks_title),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.lg)
                        .semantics { heading() },
                )
                if (accountAction != null) {
                    Box(Modifier.padding(end = PlanrSpacing.sm)) { accountAction() }
                }
            }
            Filters(
                filters = state.filters,
                partnerName = state.partnerName,
                onScope = viewModel::setScope,
                onState = viewModel::setStateFilter,
            )
            TaskListBody(
                state = state,
                listState = listState,
                onRefresh = viewModel::refresh,
                onOpenTask = onOpenTask,
                onToggleDone = viewModel::toggleDone,
                onClearFilters = viewModel::clearFilters,
            )
        }
    }
}

@Composable
private fun NoticeEffect(notice: TasksNotice?, snackbar: SnackbarHostState, viewModel: TasksViewModel) {
    val completed = stringResource(R.string.task_completed)
    val reopened = stringResource(R.string.task_reopened)
    val stale = stringResource(R.string.task_stale)
    val failed = stringResource(R.string.task_failed)
    val undo = stringResource(R.string.task_undo)
    val haptics = rememberPlanrHaptics()
    LaunchedEffect(notice) {
        if (notice == null) return@LaunchedEffect
        try {
            when (notice) {
                is TasksNotice.Toggled -> {
                    val result = snackbar.showSnackbar(
                        message = if (notice.done) completed else reopened,
                        actionLabel = undo,
                        duration = SnackbarDuration.Short,
                    )
                    if (result == SnackbarResult.ActionPerformed) {
                        haptics.tick()
                        viewModel.undo(notice)
                    }
                }
                TasksNotice.Stale -> {
                    haptics.reject()
                    snackbar.showSnackbar(stale)
                }
                TasksNotice.Failed -> {
                    haptics.reject()
                    snackbar.showSnackbar(failed)
                }
            }
        } finally {
            // Consumed even when cancelled (the user navigated away mid-snackbar):
            // coming back must not replay an old "Completed · Undo".
            viewModel.dismissNotice(notice)
        }
    }
}

@Composable
private fun Filters(
    filters: TaskFilters,
    partnerName: String?,
    onScope: (TaskScope) -> Unit,
    onState: (TaskStateFilter) -> Unit,
) {
    val scopes = buildList {
        add(TaskScope.All to stringResource(R.string.tasks_filter_all))
        add(TaskScope.Mine to stringResource(R.string.tasks_filter_mine))
        add(TaskScope.Partner to (partnerName ?: stringResource(R.string.tasks_filter_partner)))
        add(TaskScope.Shared to stringResource(R.string.tasks_filter_shared))
    }
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = PlanrSpacing.xl),
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            items(scopes, key = { it.first }) { (scope, label) ->
                FilterChip(
                    selected = filters.scope == scope,
                    onClick = { onScope(scope) },
                    label = { Text(label) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                    ),
                )
            }
        }
        val states = listOf(
            TaskStateFilter.Open to stringResource(R.string.tasks_filter_open),
            TaskStateFilter.Done to stringResource(R.string.tasks_filter_done),
            TaskStateFilter.All to stringResource(R.string.tasks_filter_all),
        )
        SingleChoiceSegmentedButtonRow(
            Modifier
                .padding(horizontal = PlanrSpacing.xl)
                .fillMaxWidth(),
        ) {
            states.forEachIndexed { index, (value, label) ->
                SegmentedButton(
                    selected = filters.state == value,
                    onClick = { onState(value) },
                    shape = SegmentedButtonDefaults.itemShape(index, states.size),
                    icon = {},
                    label = { Text(label) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskListBody(
    state: TasksUiState,
    listState: LazyListState,
    onRefresh: () -> Unit,
    onOpenTask: (String) -> Unit,
    onToggleDone: (String) -> Unit,
    onClearFilters: () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            state.loading -> Unit
            !state.hasAnyTask -> PlaceholderScreen(
                title = stringResource(R.string.tasks_empty_title),
                body = stringResource(R.string.tasks_empty_body),
            )
            state.groups.isEmpty() -> PlaceholderScreen(
                title = stringResource(R.string.tasks_filtered_empty_title),
                body = stringResource(R.string.tasks_filtered_empty_body),
                action = {
                    if (state.filters != TaskFilters()) {
                        TextButton(onClick = onClearFilters) { Text(stringResource(R.string.tasks_filtered_clear)) }
                    }
                },
            )
            else -> TaskGroupsList(state, listState, onOpenTask, onToggleDone)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TaskGroupsList(
    state: TasksUiState,
    listState: LazyListState,
    onOpenTask: (String) -> Unit,
    onToggleDone: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(start = PlanrSpacing.xl, end = PlanrSpacing.xl, bottom = 88.dp),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
    ) {
        state.groups.forEach { group ->
            stickyHeader(key = "header-${group.key}") { GroupHeader(group) }
            items(group.items, key = { it.task.id }) { item ->
                TaskCard(
                    item = item,
                    pending = item.task.id in state.pendingIds,
                    onOpen = { onOpenTask(item.task.id) },
                    onToggleDone = { onToggleDone(item.task.id) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}

/** A section label with its count; Overdue reads in the destructive tone. */
@Composable
private fun GroupHeader(group: TaskGroup) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .padding(top = PlanrSpacing.lg, bottom = PlanrSpacing.xs)
            .semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
    ) {
        Text(
            text = groupLabel(group.key),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (group.key == TaskGroupKey.Overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = group.items.size.toString(),
            style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = TABULAR_NUMS),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
