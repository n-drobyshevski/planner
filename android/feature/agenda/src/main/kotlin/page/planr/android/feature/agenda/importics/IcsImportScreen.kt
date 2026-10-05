package page.planr.android.feature.agenda.importics

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.ical.IcsEvent
import page.planr.android.core.ical.IcsWarning
import page.planr.android.core.recurrence.RRuleBuild
import page.planr.android.feature.agenda.CategorySelect
import page.planr.android.feature.agenda.Hint
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.Section
import page.planr.android.feature.agenda.VisibilitySelect
import page.planr.android.feature.agenda.WhenSection
import page.planr.android.feature.agenda.edit.EventForm
import page.planr.android.feature.agenda.ui.AgendaFormats
import page.planr.android.feature.agenda.ui.AgendaIcons
import page.planr.android.feature.agenda.ui.recurrenceSummary
import page.planr.android.feature.agenda.ui.rememberAgendaFormats

/**
 * The .ics import review: filter the file's events by name and dates, tick
 * the ones to import, fix a title or time inline, choose one context and
 * sharing for all of them, then import. Nothing is written before Import.
 *
 * @param onDone called after a successful import (the agenda shows the notice).
 * @param onClose called when the review is left without importing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IcsImportScreen(
    onDone: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: IcsImportViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val failedText = stringResource(R.string.agenda_import_failed)
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                IcsImportEffect.Done -> onDone()
                IcsImportEffect.Failed -> snackbar.showSnackbar(failedText)
            }
        }
    }

    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.agenda_import_title)) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(AgendaIcons.Close, contentDescription = stringResource(R.string.agenda_close))
                    }
                },
                actions = {
                    if (state.phase == IcsImportUiState.Phase.Ready) {
                        val count = state.toImport.size
                        Button(
                            onClick = viewModel::import,
                            enabled = count > 0 && !state.importing,
                            modifier = Modifier.padding(end = PlanrSpacing.sm),
                        ) {
                            Text(
                                when {
                                    state.importing -> stringResource(R.string.agenda_import_importing)
                                    count == 0 -> stringResource(R.string.agenda_import_submit_none)
                                    else -> pluralStringResource(R.plurals.agenda_import_submit, count, count)
                                },
                                maxLines = 1,
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        when (state.phase) {
            IcsImportUiState.Phase.Loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            }
            IcsImportUiState.Phase.NoFile -> PlaceholderScreen(
                title = stringResource(R.string.agenda_import_no_file_title),
                body = stringResource(R.string.agenda_import_no_file_body),
                modifier = Modifier.padding(padding),
            )
            IcsImportUiState.Phase.Empty -> PlaceholderScreen(
                title = stringResource(R.string.agenda_import_no_events),
                body = if (state.skipped > 0) pluralStringResource(R.plurals.agenda_import_skipped, state.skipped, state.skipped) else "",
                modifier = Modifier.padding(padding),
            )
            IcsImportUiState.Phase.Ready -> Review(state, viewModel, Modifier.padding(padding))
        }
    }
}

@Composable
private fun Review(state: IcsImportUiState, viewModel: IcsImportViewModel, modifier: Modifier = Modifier) {
    val formats = rememberAgendaFormats()
    val zone = remember(state.zone) { TimeZone.of(state.zone) }
    val currentYear = remember(zone) { Clock.System.now().toLocalDateTime(zone).year }
    LazyColumn(
        modifier = modifier.fillMaxSize().imePadding(),
        contentPadding = PaddingValues(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        item(key = "filters") { Filters(state, formats, viewModel) }
        item(key = "filing") {
            Section(stringResource(R.string.agenda_import_filing)) {
                Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
                    CategorySelect(state.categoryId, state.categories, viewModel::setCategory)
                    if (state.sharedContext) {
                        Hint(stringResource(R.string.agenda_editor_shared_context_banner))
                    } else {
                        VisibilitySelect(state.visibility, viewModel::setVisibility)
                    }
                }
            }
        }
        item(key = "notes") { Notes(state) }
        item(key = "selection") { SelectionBar(state, viewModel) }
        if (state.visible.isEmpty()) {
            item(key = "no-matches") { Hint(stringResource(R.string.agenda_import_no_matches)) }
        }
        items(state.visible, key = { it.key }) { row ->
            Column {
                RowItem(
                    row = row,
                    expanded = state.expandedKey == row.key,
                    zone = zone,
                    currentYear = currentYear,
                    formats = formats,
                    viewModel = viewModel,
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
        item(key = "end") { Spacer(Modifier.size(PlanrSpacing.xl)) }
    }
}

@Composable
private fun Filters(state: IcsImportUiState, formats: AgendaFormats, viewModel: IcsImportViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        OutlinedTextField(
            value = state.nameFilter,
            onValueChange = viewModel::setNameFilter,
            label = { Text(stringResource(R.string.agenda_import_name_filter)) },
            placeholder = { Text(stringResource(R.string.agenda_import_name_placeholder)) },
            isError = state.nameFilterInvalid,
            supportingText = if (state.nameFilterInvalid) {
                { Text(stringResource(R.string.agenda_import_invalid_regex)) }
            } else {
                null
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            stringResource(R.string.agenda_import_date_range),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OptionalDateRow(stringResource(R.string.agenda_import_from), state.from, formats, viewModel::setFrom)
        OptionalDateRow(stringResource(R.string.agenda_import_to), state.to, formats, viewModel::setTo)
    }
}

/** A labelled date that may be left open ("Any date"), with a clear button once set. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OptionalDateRow(label: String, date: LocalDate?, formats: AgendaFormats, onPick: (LocalDate?) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    val text = date?.let(formats::date) ?: stringResource(R.string.agenda_import_any_date)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        OutlinedButton(
            onClick = { open = true },
            modifier = Modifier.semantics { contentDescription = "$label, $text" },
        ) { Text(text, maxLines = 1) }
        if (date != null) {
            IconButton(onClick = { onPick(null) }) {
                Icon(
                    AgendaIcons.Close,
                    contentDescription = stringResource(R.string.agenda_import_clear_date, label),
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
    if (!open) return
    // The picker speaks UTC-midnight millis for a calendar date.
    val state = rememberDatePickerState(initialSelectedDateMillis = date?.atStartOfDayIn(TimeZone.UTC)?.toEpochMilliseconds())
    DatePickerDialog(
        onDismissRequest = { open = false },
        confirmButton = {
            TextButton(onClick = {
                open = false
                state.selectedDateMillis?.let { ms ->
                    onPick(Instant.fromEpochMilliseconds(ms).toLocalDateTime(TimeZone.UTC).date)
                }
            }) { Text(stringResource(R.string.agenda_save)) }
        },
        dismissButton = {
            TextButton(onClick = { open = false }) { Text(stringResource(R.string.agenda_cancel)) }
        },
    ) {
        DatePicker(state = state, showModeToggle = true)
    }
}

/** What the file couldn't give, and whether duplicates could be checked. */
@Composable
private fun Notes(state: IcsImportUiState) {
    if (state.skipped == 0 && !state.duplicatesUnknown) return
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs)) {
        if (state.duplicatesUnknown) Hint(stringResource(R.string.agenda_import_lookup_error))
        if (state.skipped > 0) Hint(pluralStringResource(R.plurals.agenda_import_skipped, state.skipped, state.skipped))
    }
}

@Composable
private fun SelectionBar(state: IcsImportUiState, viewModel: IcsImportViewModel) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            pluralStringResource(R.plurals.agenda_import_shown, state.rows.size, state.visible.size, state.rows.size),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = { viewModel.selectAll(true) }, enabled = state.visible.isNotEmpty() && !state.allVisibleSelected) {
            Text(stringResource(R.string.agenda_import_select_all), maxLines = 1)
        }
        TextButton(onClick = { viewModel.selectAll(false) }, enabled = state.visible.any { it.selected }) {
            Text(stringResource(R.string.agenda_import_select_none), maxLines = 1)
        }
    }
}

@Composable
private fun RowItem(
    row: ImportRow,
    expanded: Boolean,
    zone: TimeZone,
    currentYear: Int,
    formats: AgendaFormats,
    viewModel: IcsImportViewModel,
) {
    val event = row.current
    val untitled = stringResource(R.string.agenda_untitled)
    val title = event.title.ifBlank { untitled }
    val editLabel = stringResource(R.string.agenda_import_edit_row, title)
    Column(Modifier.fillMaxWidth().animateContentSize()) {
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.small)
                .clickable(role = Role.Button, onClickLabel = editLabel) { viewModel.expand(row.key) }
                .padding(vertical = PlanrSpacing.sm),
        ) {
            val includeLabel = stringResource(R.string.agenda_import_include, title)
            Checkbox(
                checked = row.selected,
                onCheckedChange = { viewModel.toggle(row.key) },
                modifier = Modifier.semantics { contentDescription = includeLabel },
            )
            Column(
                modifier = Modifier.weight(1f).padding(top = PlanrSpacing.md),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontStyle = if (event.title.isBlank()) FontStyle.Italic else null,
                    color = if (event.title.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    whenText(event, zone, currentYear, formats),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                repeatText(event, zone, formats)?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Badges(row)
            }
            Icon(
                AgendaIcons.ChevronDown,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = PlanrSpacing.md).size(18.dp),
            )
        }
        if (expanded) {
            InlineEditor(row, formats) { transform -> viewModel.edit(row.key, transform) }
            if (row.edited) {
                TextButton(onClick = { viewModel.resetEdits(row.key) }) { Text(stringResource(R.string.agenda_import_reset)) }
            }
            Spacer(Modifier.size(PlanrSpacing.sm))
        }
    }
}

/** Title, all-day and start / end, the editor's own controls. */
@Composable
private fun InlineEditor(row: ImportRow, formats: AgendaFormats, onChange: ((EventForm) -> EventForm) -> Unit) {
    Column(
        modifier = Modifier.padding(start = PlanrSpacing.xl, top = PlanrSpacing.xs),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
    ) {
        OutlinedTextField(
            value = row.form.title,
            onValueChange = { title -> onChange { it.copy(title = title) } },
            label = { Text(stringResource(R.string.agenda_import_title_label)) },
            placeholder = { Text(stringResource(R.string.agenda_untitled)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier.fillMaxWidth(),
        )
        WhenSection(row.form, row.error, formats, onChange)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Badges(row: ImportRow) {
    val labels = buildList {
        if (row.duplicate) add(R.string.agenda_import_badge_duplicate)
        if (row.event.cancelled) add(R.string.agenda_import_badge_cancelled)
        if (row.repeatsUnsupported) add(R.string.agenda_import_badge_rrule_unsupported)
        if (IcsWarning.ZoneUnknown in row.event.warnings) add(R.string.agenda_import_badge_zone_unknown)
        if (IcsWarning.RDateIgnored in row.event.warnings) add(R.string.agenda_import_badge_rdate_ignored)
        if (row.edited) add(R.string.agenda_import_badge_edited)
    }
    if (labels.isEmpty()) return
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xs),
        modifier = Modifier.padding(top = PlanrSpacing.xs),
    ) {
        labels.forEach { label ->
            Text(
                stringResource(label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.small)
                    .padding(horizontal = PlanrSpacing.sm, vertical = 2.dp),
            )
        }
    }
}

/** "Mon, 5 Oct · 09:00 – 09:30", "Sat, 31 Oct – Sun, 1 Nov", or across days with times; the year outside [currentYear]. */
@Composable
private fun whenText(event: IcsEvent, zone: TimeZone, currentYear: Int, formats: AgendaFormats): String {
    fun day(date: LocalDate) = if (date.year == currentYear) formats.shortDate(date) else formats.date(date)
    val start = Instant.fromEpochMilliseconds(event.start)
    val end = Instant.fromEpochMilliseconds(event.end)
    if (event.allDay) {
        val first = start.toLocalDateTime(TimeZone.UTC).date
        val last = maxOf(end.toLocalDateTime(TimeZone.UTC).date.minus(1, DateTimeUnit.DAY), first)
        return if (first == last) {
            stringResource(R.string.agenda_import_when, day(first), stringResource(R.string.agenda_all_day))
        } else {
            stringResource(R.string.agenda_import_range, day(first), day(last))
        }
    }
    val s = start.toLocalDateTime(zone)
    val e = end.toLocalDateTime(zone)
    return if (s.date == e.date) {
        stringResource(
            R.string.agenda_import_when,
            day(s.date),
            stringResource(R.string.agenda_import_range, formats.time(s.time), formats.time(e.time)),
        )
    } else {
        stringResource(
            R.string.agenda_import_range,
            "${day(s.date)} ${formats.time(s.time)}",
            "${day(e.date)} ${formats.time(e.time)}",
        )
    }
}

/** The repeat summary of a series ("Repeats weekly on Mon, Wed, until 30 Nov 2026"); null for a one-off. */
@Composable
private fun repeatText(event: IcsEvent, zone: TimeZone, formats: AgendaFormats): String? {
    val rrule = event.rrule ?: return null
    if (YEARLY.containsMatchIn(rrule)) {
        return stringResource(R.string.agenda_import_repeats_yearly)
    }
    val form = runCatching { RRuleBuild.parseRRule(rrule) }.getOrNull() ?: return stringResource(R.string.agenda_import_repeats)
    return recurrenceSummary(form, formats, if (event.allDay) TimeZone.UTC else zone)
}

private val YEARLY = Regex("(^|;)FREQ=YEARLY(;|$)", RegexOption.IGNORE_CASE)
