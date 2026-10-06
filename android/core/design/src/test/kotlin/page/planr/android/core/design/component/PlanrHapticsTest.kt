package page.planr.android.core.design.component

import android.view.HapticFeedbackConstants
import kotlin.test.Test
import kotlin.test.assertEquals

class PlanrHapticsTest {

    @Test
    fun `confirm and reject use the dedicated constants from Android 11`() {
        assertEquals(HapticFeedbackConstants.CONFIRM, hapticConstant(HapticKind.Confirm, sdk = 30))
        assertEquals(HapticFeedbackConstants.REJECT, hapticConstant(HapticKind.Reject, sdk = 35))
    }

    @Test
    fun `older releases fall back to a key press`() {
        assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, hapticConstant(HapticKind.Confirm, sdk = 29))
        assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, hapticConstant(HapticKind.Reject, sdk = 26))
    }

    @Test
    fun `a tick is a clock tick everywhere`() {
        assertEquals(HapticFeedbackConstants.CLOCK_TICK, hapticConstant(HapticKind.Tick, sdk = 26))
        assertEquals(HapticFeedbackConstants.CLOCK_TICK, hapticConstant(HapticKind.Tick, sdk = 35))
    }
}
