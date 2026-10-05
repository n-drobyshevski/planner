package page.planr.android.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.datetime.LocalDate

class LaunchRouteTest {

    @Test
    fun `tab routes open their tab`() {
        assertEquals(LaunchRoute.Tab(TopLevelTab.Agenda), LaunchRoute.parse("agenda"))
        assertEquals(LaunchRoute.Tab(TopLevelTab.Tasks), LaunchRoute.parse("tasks"))
    }

    @Test
    fun `an occurrence key stays encoded and opens under the agenda`() {
        val parsed = LaunchRoute.parse("event/ev-1%3A1767268800000")
        assertEquals(LaunchRoute.Event("ev-1%3A1767268800000"), parsed)
        assertEquals(TopLevelTab.Agenda, parsed?.tab)
        assertEquals("event/ev-1%3A1767268800000", (parsed as LaunchRoute.Event).route)
    }

    @Test
    fun `a task opens under the tasks tab`() {
        val parsed = LaunchRoute.parse("task/7d0c")
        assertEquals(LaunchRoute.Task("7d0c"), parsed)
        assertEquals(TopLevelTab.Tasks, parsed?.tab)
        assertEquals("task/7d0c", (parsed as LaunchRoute.Task).route)
    }

    @Test
    fun `a day opens under the agenda`() {
        val parsed = LaunchRoute.parse("day/2026-10-07")
        assertEquals(LaunchRoute.Day(LocalDate(2026, 10, 7)), parsed)
        assertEquals(TopLevelTab.Agenda, parsed?.tab)
    }

    @Test
    fun `anything else is ignored`() {
        listOf(
            null,
            "",
            "signin",
            "event/",
            "task/",
            "event/a/b",
            "task/1?x=2",
            "event-edit/1",
            "event-new",
            "settings",
            "day/",
            "day/2026-13-01",
            "day/2026-02-30",
            "day/2026-10-07T10:00",
            "day/+2026-10-07",
            "day/2026-10-07/x",
        ).forEach { assertNull(LaunchRoute.parse(it), "route: $it") }
    }

    @Test
    fun `the import review opens under the agenda and is never parsed from a route`() {
        assertEquals(TopLevelTab.Agenda, LaunchRoute.Import.tab)
        assertEquals("ics-import", LaunchRoute.Import.route)
        assertNull(LaunchRoute.parse("ics-import"))
    }

    @Test
    fun `editors are recognised so a widget launch doesn't pop their draft`() {
        assertTrue(isEditorRoute("event-edit/{id}"))
        assertTrue(isEditorRoute("event-new?start={start}"))
        assertTrue(isEditorRoute("ics-import"))
        assertTrue(isEditorRoute(PlanrRoutes.TASK))
        assertFalse(isEditorRoute(PlanrRoutes.AGENDA))
        assertFalse(isEditorRoute(PlanrRoutes.EVENT))
        assertFalse(isEditorRoute(null))
    }
}
