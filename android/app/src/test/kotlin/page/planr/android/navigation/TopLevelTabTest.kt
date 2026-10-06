package page.planr.android.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import page.planr.android.feature.inbox.InboxDestinations
import page.planr.android.feature.insights.InsightsDestinations

class TopLevelTabTest {

    @Test
    fun `the insights route is the one the feature registers`() {
        assertEquals(InsightsDestinations.ROUTE, PlanrRoutes.INSIGHTS)
        assertEquals(TopLevelTab.Insights, TopLevelTab.ofRoute(InsightsDestinations.ROUTE))
    }

    @Test
    fun `the inbox route is the one the feature registers, and no tab`() {
        assertEquals(InboxDestinations.ROUTE, PlanrRoutes.INBOX)
        assertNull(TopLevelTab.ofRoute(PlanrRoutes.INBOX))
    }

    @Test
    fun `only insights has no quick add`() {
        assertNull(TopLevelTab.Insights.quickAddKind)
        TopLevelTab.entries.filter { it != TopLevelTab.Insights }.forEach { assertNotNull(it.quickAddKind, it.name) }
    }
}
