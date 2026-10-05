package page.planr.android.feature.quickadd

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
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
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.quickadd.model.QuickAddError
import page.planr.android.feature.quickadd.ui.EventFields
import page.planr.android.feature.quickadd.ui.TaskFields

/**
 * Quick add for a task or an event, as a modal bottom sheet: a focused title
 * field plus the minimum to place it (a due date, or a day and times). Hosted
 * in-app and by [QuickAddActivity] for the home-screen widget.
 *
 * @param kind what the sheet opens on; the user can still switch.
 * @param onDismiss called once the sheet is gone (cancelled, swiped away, or saved).
 * @param onSaved called with what was created, just before the sheet closes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickAddSheet(
    kind: QuickAddKind,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    onSaved: (QuickAddKind) -> Unit = {},
    viewModel: QuickAddViewModel = hiltViewModel(),
) {
    // Reset once per opening of the sheet, before its state is first read, so a
    // previous opening's "saved" can't close this one. Restored (not re-run)
    // after rotation or process death, which keeps the draft.
    rememberSaveable {
        viewModel.start(kind)
        true
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.saved) {
        val saved = state.saved ?: return@LaunchedEffect
        onSaved(saved)
        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier,
        containerColor = PlanrTheme.colors.card,
    ) {
        QuickAddContent(
            state = state,
            viewModel = viewModel,
            onCancel = { scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() } },
        )
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
