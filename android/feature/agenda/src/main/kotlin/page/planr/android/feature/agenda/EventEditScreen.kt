package page.planr.android.feature.agenda

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import page.planr.android.core.design.component.PlaceholderScreen
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTokens
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.core.model.Category
import page.planr.android.feature.agenda.edit.DateField
import page.planr.android.feature.agenda.edit.EventEditEffect
import page.planr.android.feature.agenda.edit.EventEditUiState
import page.planr.android.feature.agenda.edit.EventEditViewModel
import page.planr.android.feature.agenda.edit.EventForm
import page.planr.android.feature.agenda.edit.EventFormError
import page.planr.android.feature.agenda.edit.RecurrencePicker
import page.planr.android.feature.agenda.edit.TimeField
import page.planr.android.feature.agenda.edit.TimeZonePickerDialog
import page.planr.android.feature.agenda.edit.VisibilityChoice
import page.planr.android.feature.agenda.edit.zoneLabel
import page.planr.android.feature.agenda.ui.AgendaFormats
import page.planr.android.feature.agenda.ui.AgendaIcons
import page.planr.android.feature.agenda.ui.RecurrenceScopeDialog
import page.planr.android.feature.agenda.ui.SelectField
import page.planr.android.feature.agenda.ui.SelectOption
import page.planr.android.feature.agenda.ui.rememberAgendaFormats

/**
 * Create or edit an event: title, all-day, start / end, time zone (defaults
 * to the member's), context, sharing, repeat, place and notes. Saving an
 * instance of a series asks "this / this and following / all events" first.
 * A conflicting edit made elsewhere surfaces as a calm snackbar offering to
 * reload; the form is never discarded on failure.
 *
 * @param onDone called after a successful save.
 * @param onClose called when the editor is closed without saving.
 * @param viewModelKey distinguishes editor sessions sharing one
 *   ViewModelStoreOwner (the in-place editors, which also take over Back);
 *   a navigation route needs no key.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventEditScreen(
    target: EventEditTarget,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
    onClose: () -> Unit = onDone,
    viewModelKey: String? = null,
) {
    BackHandler(enabled = viewModelKey != null, onBack = onClose)
    val viewModel = hiltViewModel<EventEditViewModel, EventEditViewModel.Factory>(key = viewModelKey) {
        it.create(target)
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val staleText = stringResource(R.string.agenda_stale_event)
    val reloadText = stringResource(R.string.agenda_stale_reload)
    val failedText = stringResource(R.string.agenda_something_went_wrong)
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                EventEditEffect.Done -> onDone()
                EventEditEffect.Stale -> {
                    val result = snackbar.showSnackbar(staleText, actionLabel = reloadText, duration = SnackbarDuration.Indefinite, withDismissAction = true)
                    if (result == SnackbarResult.ActionPerformed) viewModel.reloadLatest()
                }
                EventEditEffect.Failed -> snackbar.showSnackbar(failedText)
            }
        }
    }

    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Text(stringResource(if (state.isNew) R.string.agenda_editor_new_event else R.string.agenda_editor_edit_event))
                },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(AgendaIcons.Close, contentDescription = stringResource(R.string.agenda_close))
                    }
                },
                actions = {
                    if (state.phase == EventEditUiState.Phase.Ready) {
                        Button(
                            onClick = viewModel::save,
                            enabled = !state.saving,
                            modifier = Modifier.padding(end = PlanrSpacing.sm),
                        ) {
                            Text(stringResource(if (state.saving) R.string.agenda_saving else R.string.agenda_save))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        val form = state.form
        when {
            state.phase == EventEditUiState.Phase.Missing -> PlaceholderScreen(
                title = stringResource(R.string.agenda_detail_missing_title),
                body = stringResource(R.string.agenda_detail_missing_body),
                modifier = Modifier.padding(padding),
            )
            form == null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            }
            else -> EditorFields(
                state = state,
                form = form,
                onChange = viewModel::update,
                modifier = Modifier.padding(padding),
            )
        }
    }

    if (state.askScope) {
        RecurrenceScopeDialog(delete = false, onChoose = viewModel::chooseScope, onDismiss = viewModel::dismissScope)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditorFields(
    state: EventEditUiState,
    form: EventForm,
    onChange: ((EventForm) -> EventForm) -> Unit,
    modifier: Modifier = Modifier,
) {
    val formats = rememberAgendaFormats()
    Column(
        modifier = modifier
            .fillMaxSize()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = PlanrSpacing.xl, vertical = PlanrSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        OutlinedTextField(
            value = form.title,
            onValueChange = { title -> onChange { it.copy(title = title) } },
            label = { Text(stringResource(R.string.agenda_editor_title_label)) },
            placeholder = { Text(stringResource(R.string.agenda_editor_title_placeholder)) },
            isError = state.error == EventFormError.TitleRequired,
            supportingText = if (state.error == EventFormError.TitleRequired) {
                { Text(stringResource(R.string.agenda_editor_title_required)) }
            } else {
                null
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier.fillMaxWidth(),
        )

        WhenSection(form, state.error, formats, onChange)

        Section(stringResource(R.string.agenda_recurrence_repeat)) {
            RecurrencePicker(
                value = form.recurrence,
                onChange = { rule -> onChange { it.copy(recurrence = rule) } },
                startDate = form.startDate,
                zone = form.zone,
                formats = formats,
            )
        }

        Section(stringResource(R.string.agenda_editor_context)) {
            CategorySelect(form.categoryId, state.categories) { id -> onChange { it.copy(categoryId = id) } }
        }

        Section(stringResource(R.string.agenda_editor_sharing)) {
            if (state.sharedContext) {
                Hint(stringResource(R.string.agenda_editor_shared_context_banner))
            } else {
                VisibilitySelect(form.visibility) { choice -> onChange { it.copy(visibility = choice) } }
            }
        }

        OutlinedTextField(
            value = form.location,
            onValueChange = { value -> onChange { it.copy(location = value) } },
            label = { Text(stringResource(R.string.agenda_editor_location)) },
            placeholder = { Text(stringResource(R.string.agenda_editor_location_placeholder)) },
            leadingIcon = { Icon(AgendaIcons.MapPin, contentDescription = null, modifier = Modifier.size(18.dp)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = form.description,
            onValueChange = { value -> onChange { it.copy(description = value) } },
            label = { Text(stringResource(R.string.agenda_editor_notes)) },
            minLines = 3,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.size(PlanrSpacing.xl))
    }
}

/**
 * All-day, start / end and (for a timed event) the time zone: the editor's
 * "when" block, also used inline by the .ics import review. [error] shows the
 * end-before-start message.
 */
@Composable
internal fun WhenSection(
    form: EventForm,
    error: EventFormError?,
    formats: AgendaFormats,
    onChange: ((EventForm) -> EventForm) -> Unit,
) {
    var pickingZone by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.agenda_editor_all_day),
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f),
            )
            Switch(checked = form.allDay, onCheckedChange = { allDay -> onChange { it.copy(allDay = allDay) } })
        }
        DateTimeRow(
            label = stringResource(R.string.agenda_editor_start),
            dateLabel = stringResource(R.string.agenda_editor_start_date),
            timeLabel = stringResource(R.string.agenda_editor_start_time),
            date = form.startDate,
            time = form.startTime,
            allDay = form.allDay,
            formats = formats,
            onDate = { date -> onChange { it.withStart(date = date) } },
            onTime = { time -> onChange { it.withStart(time = time) } },
        )
        DateTimeRow(
            label = stringResource(R.string.agenda_editor_end),
            dateLabel = stringResource(R.string.agenda_editor_end_date),
            timeLabel = stringResource(R.string.agenda_editor_end_time),
            date = form.endDate,
            time = form.endTime,
            allDay = form.allDay,
            formats = formats,
            onDate = { date -> onChange { it.copy(endDate = date) } },
            onTime = { time -> onChange { it.copy(endTime = time) } },
        )
        if (error == EventFormError.EndBeforeStart) {
            Text(
                stringResource(R.string.agenda_editor_end_after_start),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        if (!form.allDay) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(AgendaIcons.Globe, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(PlanrSpacing.sm))
                Text(
                    stringResource(R.string.agenda_editor_time_zone),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                OutlinedButton(onClick = { pickingZone = true }) { Text(zoneLabel(form.timeZone), maxLines = 1) }
            }
        }
    }
    if (pickingZone) {
        TimeZonePickerDialog(
            current = form.timeZone,
            onPick = { id ->
                pickingZone = false
                onChange { it.withTimeZone(id) }
            },
            onDismiss = { pickingZone = false },
        )
    }
}

@Composable
private fun DateTimeRow(
    label: String,
    dateLabel: String,
    timeLabel: String,
    date: kotlinx.datetime.LocalDate,
    time: kotlinx.datetime.LocalTime,
    allDay: Boolean,
    formats: AgendaFormats,
    onDate: (kotlinx.datetime.LocalDate) -> Unit,
    onTime: (kotlinx.datetime.LocalTime) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        DateField(date = date, label = dateLabel, formats = formats, onPick = onDate)
        if (!allDay) TimeField(time = time, label = timeLabel, formats = formats, onPick = onTime)
    }
}

@Composable
internal fun CategorySelect(selectedId: String?, categories: List<Category>, onSelect: (String?) -> Unit) {
    val none = SelectOption<String?>(null, stringResource(R.string.agenda_editor_no_context))
    val options = listOf(none) + categories.sortedBy { it.sortOrder }.map { category ->
        SelectOption<String?>(category.id, category.name, leading = { Swatch(category.color) })
    }
    SelectField(
        selected = options.firstOrNull { it.value == selectedId } ?: none,
        options = options,
        onSelect = onSelect,
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun VisibilitySelect(value: VisibilityChoice, onSelect: (VisibilityChoice) -> Unit) {
    val choices = VisibilityChoice.entries
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            choices.forEachIndexed { index, choice ->
                SegmentedButton(
                    selected = value == choice,
                    onClick = { onSelect(choice) },
                    shape = SegmentedButtonDefaults.itemShape(index, choices.size),
                    icon = {},
                    label = {
                        Text(
                            stringResource(
                                when (choice) {
                                    VisibilityChoice.Private -> R.string.agenda_visibility_private
                                    VisibilityChoice.Visible -> R.string.agenda_visibility_visible
                                    VisibilityChoice.Shared -> R.string.agenda_visibility_shared
                                },
                            ),
                            maxLines = 1,
                        )
                    },
                )
            }
        }
        Hint(
            stringResource(
                when (value) {
                    VisibilityChoice.Private -> R.string.agenda_visibility_hint_private
                    VisibilityChoice.Visible -> R.string.agenda_visibility_hint_visible
                    VisibilityChoice.Shared -> R.string.agenda_visibility_hint_shared
                },
            ),
        )
    }
}

@Composable
internal fun Section(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm)) {
        Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

@Composable
internal fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Swatch(hex: String) {
    Box(
        Modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(parseHexColor(hex, PlanrTokens.WarmStone)),
    )
}
