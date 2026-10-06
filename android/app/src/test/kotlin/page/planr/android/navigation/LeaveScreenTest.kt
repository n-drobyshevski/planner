package page.planr.android.navigation

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import page.planr.android.feature.inbox.InboxDestinations

class LeaveScreenTest {

    @Test
    fun `the back arrow leaves its screen while it is on top`() {
        assertTrue(mayLeave(PlanrRoutes.SETTINGS, top = PlanrRoutes.SETTINGS))
        assertTrue(mayLeave(PlanrRoutes.INBOX, top = PlanrRoutes.INBOX))
    }

    @Test
    fun `a second tap during the exit doesn't pop the screen underneath`() {
        // The first tap already popped back to the agenda, the start destination.
        assertFalse(mayLeave(PlanrRoutes.SETTINGS, top = PlanrRoutes.AGENDA))
        assertFalse(mayLeave(PlanrRoutes.INBOX, top = PlanrRoutes.AGENDA))
        assertFalse(mayLeave(PlanrRoutes.INBOX, top = PlanrRoutes.TASKS))
        assertFalse(mayLeave(PlanrRoutes.INBOX, top = null))
    }

    @Test
    fun `the inbox route is the one the inbox screen registers`() {
        assertTrue(mayLeave(PlanrRoutes.INBOX, top = InboxDestinations.ROUTE))
    }
}
