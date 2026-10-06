package page.planr.android.feature.inbox

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import page.planr.android.core.data.inbox.InboxItem
import page.planr.android.core.data.inbox.InboxRules
import page.planr.android.core.design.R as DesignR
import page.planr.android.core.design.component.SleepRatingSheet
import page.planr.android.core.design.component.attributeLabel
import page.planr.android.core.design.component.attributeOptionLabel
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.feature.inbox.ui.InboxFormats
import page.planr.android.feature.inbox.ui.InboxIcons
import page.planr.android.feature.inbox.ui.rememberInboxFormats

/**
 * The Inbox (inbox-shell.tsx): requests first (approve / decline, with the
 * proposed slot), then recent events and tasks to rate on the 4-point
 * satisfaction scale, then nights to log in the shared rating sheet. One
 * calm line when nothing waits; one calm line when a write didn't go through.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(onBack: () -> Unit, viewModel: InboxViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Back from another app or screen: reread the requests and nights.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }
    val formats = rememberInboxFormats()
    val defaultTitle = stringResource(R.string.inbox_request_default_title)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.inbox_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(InboxIcons.ArrowLeft, contentDescription = stringResource(R.string.inbox_back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        if (state.loading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            }
        } else {
            InboxContent(
                state = state,
                formats = formats,
                onRate = viewModel::rate,
                onApprove = { viewModel.approve(it, defaultTitle) },
                onDecline = viewModel::decline,
                onOpenNight = viewModel::openNight,
                onDismissError = viewModel::dismissError,
                modifier = Modifier.padding(padding),
            )
        }
    }

    state.sheet?.let { sheet ->
        SleepRatingSheet(
            nightLabel = formats.shortDate(sheet.form.date),
            draft = sheet.form.toDraft(),
            fromHealthConnect = sheet.form.fromHealthConnect,
            saving = sheet.saving,
            error = when {
                sheet.timesOutOfOrder -> stringResource(DesignR.string.sleep_rating_times_order)
                sheet.failed -> stringResource(DesignR.string.sleep_rating_save_failed)
                else -> null
            },
            onChange = viewModel::updateDraft,
            onSave = viewModel::saveSleep,
            onDismiss = viewModel::closeSheet,
        )
    }
}

@Composable
private fun InboxContent(
    state: InboxUiState,
    formats: InboxFormats,
    onRate: (InboxItem, String) -> Unit,
    onApprove: (InboxItem.Request) -> Unit,
    onDecline: (InboxItem.Request) -> Unit,
    onOpenNight: (InboxItem.LogSleep) -> Unit,
    onDismissError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        // Pinned above the list, read out once as it appears; a tap clears it
        // (it also goes on its own after a few seconds).
        state.error?.let { error ->
            Text(
                stringResource(
                    when (error) {
                        InboxError.RateFailed -> R.string.inbox_rate_failed
                        InboxError.RequestFailed -> R.string.inbox_request_failed
                    },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClickLabel = stringResource(R.string.inbox_error_dismiss), onClick = onDismissError)
                    .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.sm)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(
                start = PlanrSpacing.xl,
                end = PlanrSpacing.xl,
                bottom = PlanrSpacing.xl,
            ),
            verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            item(key = "subtitle") {
                Text(
                    stringResource(if (state.count == 0) R.string.inbox_all_caught_up else R.string.inbox_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = PlanrSpacing.sm).semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            section(R.string.inbox_section_requests, state.requests) { item ->
                RequestRow(item, state, formats, onApprove, onDecline)
            }
            section(R.string.inbox_section_rate, state.ratings) { item ->
                RateRow(item, state, formats, onRate)
            }
            section(R.string.inbox_section_sleep, state.nights) { item ->
                SleepRow(item, formats, onOpenNight)
            }
        }
    }
}

/** A labelled card of rows; nothing at all when [items] is empty. */
private fun <T : InboxItem> LazyListScope.section(
    title: Int,
    items: List<T>,
    row: @Composable (T) -> Unit,
) {
    if (items.isEmpty()) return
    item(key = "header-$title") {
        Text(
            stringResource(title),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = PlanrSpacing.md)
                .semantics { heading() },
        )
    }
    item(key = "card-$title") {
        val shape = RoundedCornerShape(PlanrRadii.lg)
        Surface(
            color = PlanrTheme.colors.card,
            shape = shape,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, PlanrTheme.colors.hairline, shape),
        ) {
            Column {
                items.forEachIndexed { index, item ->
                    if (index > 0) HorizontalDivider(color = PlanrTheme.colors.hairline)
                    key(item.id) { row(item) }
                }
            }
        }
    }
}

/** Icon, a one-line frame and an optional subtitle: the head every row shares (inbox-row.tsx). */
@Composable
private fun RowHead(icon: ImageVector, frame: String, subtitle: String?, modifier: Modifier = Modifier, trailing: @Composable () -> Unit = {}) {
    Row(
        modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
        Column(Modifier.weight(1f)) {
            Text(
                frame,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = TABULAR_NUMS),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        trailing()
    }
}

@Composable
private fun RequestRow(
    item: InboxItem.Request,
    state: InboxUiState,
    formats: InboxFormats,
    onApprove: (InboxItem.Request) -> Unit,
    onDecline: (InboxItem.Request) -> Unit,
) {
    val name = item.requesterName?.trim()?.takeIf { it.isNotEmpty() }
    Column(
        Modifier.padding(PlanrSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
    ) {
        RowHead(
            icon = InboxIcons.CalendarPlus,
            frame = if (name != null) stringResource(R.string.inbox_request_frame, name) else stringResource(R.string.inbox_request_frame_anon),
            subtitle = formats.slot(item.proposedStart, item.proposedEnd, state.zone),
        )
        item.message?.takeIf { it.isNotBlank() }?.let { message ->
            Text(
                message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 16.dp + PlanrSpacing.md),
            )
        }
        Row(
            Modifier.padding(start = 16.dp + PlanrSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            Button(onClick = { onApprove(item) }) { Text(stringResource(R.string.inbox_request_approve)) }
            OutlinedButton(onClick = { onDecline(item) }) { Text(stringResource(R.string.inbox_request_decline)) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RateRow(item: InboxItem, state: InboxUiState, formats: InboxFormats, onRate: (InboxItem, String) -> Unit) {
    val (icon, frame, subtitle) = when (item) {
        is InboxItem.RateEvent -> Triple(
            InboxIcons.CalendarCheck,
            stringResource(R.string.inbox_rate_event_frame, item.title),
            stringResource(R.string.inbox_ended_ago, formats.ago(item.sortAt, state.now)),
        )
        is InboxItem.RateTask -> Triple(
            InboxIcons.SquareCheckBig,
            stringResource(R.string.inbox_rate_task_frame, item.title),
            stringResource(R.string.inbox_done_ago, formats.ago(item.sortAt, state.now)),
        )
        else -> return
    }
    val scale = attributeLabel(SATISFACTION)
    Column(
        Modifier.padding(PlanrSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
    ) {
        RowHead(icon, frame, subtitle)
        FlowRow(
            modifier = Modifier
                .padding(start = 16.dp + PlanrSpacing.md)
                .semantics { contentDescription = scale },
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            InboxRules.satisfactionOptions.forEach { option ->
                FilterChip(
                    selected = false,
                    onClick = { onRate(item, option) },
                    label = {
                        Text(
                            attributeOptionLabel(SATISFACTION, option),
                            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = TABULAR_NUMS),
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun SleepRow(item: InboxItem.LogSleep, formats: InboxFormats, onOpen: (InboxItem.LogSleep) -> Unit) {
    RowHead(
        icon = InboxIcons.BedDouble,
        frame = stringResource(R.string.inbox_log_sleep_frame, formats.night(item.date)),
        subtitle = null,
        modifier = Modifier
            .clickable(
                onClickLabel = stringResource(R.string.inbox_log_sleep_open),
                role = Role.Button,
                onClick = { onOpen(item) },
            )
            .heightIn(min = PlanrSpacing.touchTarget)
            .padding(horizontal = PlanrSpacing.lg, vertical = PlanrSpacing.md),
        trailing = {
            Icon(
                InboxIcons.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        },
    )
}

/** The attribute a rating row writes (`ATTRIBUTE_META` satisfaction). */
private const val SATISFACTION = "satisfaction"
