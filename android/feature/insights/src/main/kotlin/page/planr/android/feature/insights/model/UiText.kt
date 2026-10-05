package page.planr.android.feature.insights.model

import androidx.annotation.PluralsRes
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource

/**
 * A string resolved at render time, so models and pure mapping functions stay
 * Context-free (and testable on the JVM). Args that are themselves [UiText]
 * resolve first, which composes a frame string with a clause string.
 */
sealed interface UiText {
    /** A `<string>` with its format args. */
    data class Res(@param:StringRes val id: Int, val args: List<Any> = emptyList()) : UiText

    /** A `<plurals>` picked by [quantity]; [args] usually start with the count again. */
    data class Plural(@param:PluralsRes val id: Int, val quantity: Int, val args: List<Any> = listOf(quantity)) : UiText

    /** Text that needs no resource (e.g. a formatted figure). */
    data class Raw(val text: String) : UiText
}

@Composable
fun UiText.resolve(): String = when (this) {
    is UiText.Res -> stringResource(id, *resolveArgs(args))
    is UiText.Plural -> pluralStringResource(id, quantity, *resolveArgs(args))
    is UiText.Raw -> text
}

@Composable
private fun resolveArgs(args: List<Any>): Array<Any> = Array(args.size) { i ->
    when (val arg = args[i]) {
        is UiText -> arg.resolve()
        else -> arg
    }
}
