package page.planr.android.feature.agenda.model

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource

/** A string resource (plus format args) resolved at render time, so ViewModels stay Context-free. */
data class UiText(@param:StringRes val id: Int, val args: List<Any> = emptyList())

@Composable
fun UiText.resolve(): String = stringResource(id, *args.toTypedArray())
