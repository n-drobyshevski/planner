package page.planr.android.feature.quickadd

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SheetValue
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import page.planr.android.core.design.component.DiscardChangesDialog
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.quickadd.model.QuickAddError
import page.planr.android.feature.quickadd.model.SharedText
import page.planr.android.feature.quickadd.ui.NotesField
import page.planr.android.feature.quickadd.ui.EventFields
import page.planr.android.feature.quickadd.ui.TaskFields

/**
 * Quick add for a task or an event, as a modal bottom sheet: a focused title
 * field plus the minimum to place it (a due date, or a day and times). Hosted
 * in-app and by [QuickAddActivity] for the home-screen widget. With a title
 * typed, a swipe down, a tap outside or Back asks to discard it first; Cancel
 * is the explicit way out and closes at once.
 *
 * @param kind what the sheet opens on; the user can still switch.
 * @param shared text shared from another app, prefilling the title and notes.
 * @param onDismiss called once the sheet is gone (cancelled, swiped away, or saved).
 * @param onSaved called with what was created (its kind and id, for an Undo),
 *   just before the sheet closes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickAddSheet(
    kind: QuickAddKind,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    shared: SharedText? = null,
    onSaved: (QuickAddSaved) -> Unit = {},
    viewModel: QuickAddViewModel = hiltViewModel(),
) {
    // Reset once per opening of the sheet, before its state is first read, so a
    // previous opening's "saved" can't close this one. Restored (not re-run)
    // after rotation or process death, which keeps the draft.
    rememberSaveable {
        viewModel.start(kind, shared)
        true
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    // Set once the sheet is on its way out (Cancel, Discard, saved): hide() asks
    // confirmValueChange again as it lands on Hidden, and must not be refused.
    var closing by remember { mutableStateOf(false) }
    // The sheet state keeps its first confirmValueChange, so it reads the guard through a State.
    val guarded by rememberUpdatedState(state.hasDraft)
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { value ->
            if (value == SheetValue.Hidden && guarded && !closing) {
                confirmingDiscard = true
                false
            } else {
                true
            }
        },
    )
    val scope = rememberCoroutineScope()
    val close: () -> Unit = {
        closing = true
        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
    }

    LaunchedEffect(state.saved) {
        val saved = state.saved ?: return@LaunchedEffect
        onSaved(saved)
        close()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier,
        containerColor = PlanrTheme.colors.card,
    ) {
        // The sheet's own Back hides it without asking confirmValueChange. This
        // handler is registered after that one (the content composes once the
        // sheet's window is shown), so with a draft it takes Back first. The
        // sheet's properties can't express this: shouldDismissOnBackPress is read
        // only when its window is created, which would leave Back dead after a
        // rotation with a draft whose title is then cleared.
        BackHandler(enabled = state.hasDraft) { confirmingDiscard = true }
        QuickAddContent(
            state = state,
            viewModel = viewModel,
            onCancel = close,
        )
        if (confirmingDiscard) {
            DiscardChangesDialog(
                onDiscard = {
                    confirmingDiscard = false
                    close()
                },
                onKeepEditing = { confirmingDiscard = false },
            )
        }
    }
}

@Composable
private fun QuickAddContent(state: QuickAddUiState, viewModel: QuickAddViewModel, onCancel: () -> Unit) {
    val form = state.form
    val enabled = !state.saving
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .imePadding()
            // Shared notes can make the sheet taller than a small screen with the keyboard up.
            .verticalScroll(rememberScrollState())
            .padding(start = PlanrSpacing.xl, end = PlanrSpacing.xl, bottom = PlanrSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        KindPicker(form.kind, enabled, viewModel::setKind)

        OutlinedTextField(
            value = form.title,
            onValueChange = viewModel::setTitle,
            enabled = enabled,
            singleLine = true,
            label = { Text(stringResource(R.string.quickadd_title_label)) },
            placeholder = {
                Text(
                    stringResource(
                        if (form.kind == QuickAddKind.Task) {
                            R.string.quickadd_title_task_placeholder
                        } else {
                            R.string.quickadd_title_event_placeholder
                        },
                    ),
                )
            },
            isError = state.error == QuickAddError.TitleRequired,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { viewModel.save() }),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus),
        )

        when (form.kind) {
            QuickAddKind.Task -> TaskFields(state, enabled, viewModel)
            QuickAddKind.Event -> EventFields(state, enabled, viewModel)
        }

        NotesField(form.notes, enabled, viewModel::setNotes)

        state.error?.let { error ->
            Text(
                text = stringResource(error.messageRes()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm, Alignment.End),
        ) {
            TextButton(onClick = onCancel) { Text(stringResource(R.string.quickadd_cancel)) }
            Button(onClick = viewModel::save, enabled = enabled) {
                Text(stringResource(if (state.saving) R.string.quickadd_adding else R.string.quickadd_add))
            }
        }
    }
}

@Composable
private fun KindPicker(kind: QuickAddKind, enabled: Boolean, onChange: (QuickAddKind) -> Unit) {
    val kinds = listOf(QuickAddKind.Task to R.string.quickadd_kind_task, QuickAddKind.Event to R.string.quickadd_kind_event)
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        kinds.forEachIndexed { index, (value, label) ->
            SegmentedButton(
                selected = kind == value,
                onClick = { onChange(value) },
                enabled = enabled,
                shape = SegmentedButtonDefaults.itemShape(index, kinds.size),
                icon = {},
                label = { Text(stringResource(label)) },
            )
        }
    }
}

private fun QuickAddError.messageRes(): Int = when (this) {
    QuickAddError.TitleRequired -> R.string.quickadd_error_title
    QuickAddError.EndBeforeStart -> R.string.quickadd_error_end
    QuickAddError.NotSignedIn -> R.string.quickadd_error_signed_out
    QuickAddError.Failed -> R.string.quickadd_error_failed
}
