package page.planr.android.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import page.planr.android.feature.agenda.navigation.AgendaRoutes

class TabReselectTest {

    private fun stack(vararg routes: String): (String) -> Boolean = { it in routes }

    @Test
    fun `the shown tab is the root above the agenda, else the agenda`() {
        assertEquals(TopLevelTab.Agenda, shownTab(stack(PlanrRoutes.AGENDA, PlanrRoutes.EVENT)))
        assertEquals(TopLevelTab.Tasks, shownTab(stack(PlanrRoutes.AGENDA, PlanrRoutes.TASKS, PlanrRoutes.TASK)))
        assertEquals(TopLevelTab.Insights, shownTab(stack(PlanrRoutes.AGENDA, PlanrRoutes.INSIGHTS)))
        assertNull(shownTab(stack(PlanrRoutes.SIGN_IN)))
    }

    @Test
    fun `another tab is an ordinary switch`() {
        assertNull(reTapAction(TopLevelTab.Tasks, shown = TopLevelTab.Agenda, top = PlanrRoutes.AGENDA))
        assertNull(reTapAction(TopLevelTab.Agenda, shown = TopLevelTab.Insights, top = PlanrRoutes.INSIGHTS))
        assertNull(reTapAction(TopLevelTab.Agenda, shown = null, top = PlanrRoutes.SIGN_IN))
    }

    @Test
    fun `on a root, the agenda goes to today and the task list scrolls up`() {
        assertEquals(ReTapAction.GoToday, reTapAction(TopLevelTab.Agenda, TopLevelTab.Agenda, PlanrRoutes.AGENDA))
        assertEquals(ReTapAction.ScrollToTop, reTapAction(TopLevelTab.Tasks, TopLevelTab.Tasks, PlanrRoutes.TASKS))
        assertEquals(ReTapAction.None, reTapAction(TopLevelTab.Insights, TopLevelTab.Insights, PlanrRoutes.INSIGHTS))
    }

    @Test
    fun `a detail on top pops to the root`() {
        assertEquals(ReTapAction.PopToRoot, reTapAction(TopLevelTab.Agenda, TopLevelTab.Agenda, PlanrRoutes.EVENT))
    }

    @Test
    fun `an editor on top gets a back press, so its discard guard decides`() {
        listOf(AgendaRoutes.EVENT_EDIT, AgendaRoutes.EVENT_NEW, AgendaRoutes.IMPORT).forEach { route ->
            assertEquals(ReTapAction.DispatchBack, reTapAction(TopLevelTab.Agenda, TopLevelTab.Agenda, route), route)
        }
        assertEquals(ReTapAction.DispatchBack, reTapAction(TopLevelTab.Tasks, TopLevelTab.Tasks, PlanrRoutes.TASK))
    }
}
