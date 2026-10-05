package page.planr.android.feature.agenda.model

import androidx.annotation.AnyRes
import androidx.annotation.PluralsRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource

/**
 * A string resource (plus format args) resolved at render time, so ViewModels
 * stay Context-free. With [quantity], [id] is a plurals resource ([plural]).
 */
data class UiText(@param:AnyRes val id: Int, val args: List<Any> = emptyList(), val quantity: Int? = null) {
    companion object {
        /** A plurals resource for [count]; [args] default to the count itself. */
        fun plural(@PluralsRes id: Int, count: Int, args: List<Any> = listOf(count)) = UiText(id, args, quantity = count)
    }
}

@Composable
fun UiText.resolve(): String {
    val count = quantity
    return if (count != null) pluralStringResource(id, count, *args.toTypedArray()) else stringResource(id, *args.toTypedArray())
}
