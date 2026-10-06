package page.planr.android.core.design.component

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView

/**
 * The app's few haptics, kept for moments that change something: a task
 * completed or reopened, an Undo, a write that didn't go through. Nothing
 * else buzzes. [View.performHapticFeedback] honours the system's touch
 * feedback setting, so there is no setting of our own.
 */
@Immutable
class PlanrHaptics internal constructor(private val view: View?) {
    /** Something was done: a task completed. */
    fun confirm() = perform(HapticKind.Confirm)

    /** A write was refused or failed (offline, or changed elsewhere first). */
    fun reject() = perform(HapticKind.Reject)

    /** A light acknowledgement: a task reopened, an Undo. */
    fun tick() = perform(HapticKind.Tick)

    private fun perform(kind: HapticKind) {
        view?.performHapticFeedback(hapticConstant(kind, Build.VERSION.SDK_INT))
    }
}

/** [PlanrHaptics] for the current view. */
@Composable
fun rememberPlanrHaptics(): PlanrHaptics {
    val view = LocalView.current
    return remember(view) { PlanrHaptics(view) }
}

internal enum class HapticKind { Confirm, Reject, Tick }

/**
 * The feedback constant for [kind] on API [sdk]: CONFIRM / REJECT from
 * Android 11, which older releases lack, so a plain key press stands in.
 */
internal fun hapticConstant(kind: HapticKind, sdk: Int): Int = when (kind) {
    HapticKind.Confirm ->
        if (sdk >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
    HapticKind.Reject ->
        if (sdk >= Build.VERSION_CODES.R) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.VIRTUAL_KEY
    HapticKind.Tick -> HapticFeedbackConstants.CLOCK_TICK
}
