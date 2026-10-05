package page.planr.android.widgets

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.datetime.LocalDate
import page.planr.android.widgets.WidgetFixtures.ANNA
import page.planr.android.widgets.WidgetFixtures.BORIS
import page.planr.android.widgets.WidgetFixtures.borisWork
import page.planr.android.widgets.WidgetFixtures.home
import page.planr.android.widgets.WidgetFixtures.task

class TasksWidgetModelTest {
    private val today = LocalDate(2026, 10, 5)
    private val categories = listOf(home, borisWork)

    private fun build(vararg tasks: page.planr.android.core.model.Task, completing: Set<String> = emptySet()) =
        TasksWidgetModel.build(
            tasks.toList(),
            categories,
            viewerId = ANNA,
            today = today,
            completing = completing,
            boards = WidgetFixtures.columns,
        )

    @Test
    fun `shows open top-level tasks that are mine or in a shared context`() {
        val list = build(
            task("mine"),
            task("assigned-to-me", owner = BORIS, assignee = ANNA),
            task("shared", owner = BORIS, category = home.id),
            task("boris-only", owner = BORIS, category = borisWork.id),
            task("mine-but-assigned-away", assignee = BORIS),
            task("done", done = true),
            task("subtask", parent = "mine"),
        )
        assertEquals(setOf("mine", "assigned-to-me", "shared"), list.rows.map { it.id }.toSet())
        assertEquals(3, list.openCount)
    }

    @Test
    fun `a subtask whose parent is hidden stands on its own`() {
        val list = build(task("orphan", parent = "hidden-parent"))
        assertEquals(listOf("orphan"), list.rows.map { it.id })
    }

    @Test
    fun `soonest due first, undated last, then priority and position`() {
        val list = build(
            task("undated"),
            task("later", due = LocalDate(2026, 10, 20)),
            task("overdue", due = LocalDate(2026, 10, 1)),
            task("today-low", due = today, priority = 1),
            task("today-high", due = today, priority = 3),
        )
        assertEquals(listOf("overdue", "today-high", "today-low", "later", "undated"), list.rows.map { it.id })
    }

    @Test
    fun `due labels are relative to today`() {
        assertEquals(DueLabel.Overdue(LocalDate(2026, 10, 4)), TasksWidgetModel.dueLabel(LocalDate(2026, 10, 4), today))
        assertEquals(DueLabel.Today, TasksWidgetModel.dueLabel(today, today))
        assertEquals(DueLabel.Tomorrow, TasksWidgetModel.dueLabel(LocalDate(2026, 10, 6), today))
        assertEquals(DueLabel.On(LocalDate(2026, 10, 9)), TasksWidgetModel.dueLabel(LocalDate(2026, 10, 9), today))
    }

    @Test
    fun `only the owner gets a checkbox, and only with a done column to move to`() {
        val list = build(
            task("mine"),
            task("shared", owner = BORIS, category = home.id),
            task("loose", collection = null),
        )
        val byId = list.rows.associateBy { it.id }
        assertTrue(byId.getValue("mine").canComplete)
        assertFalse(byId.getValue("shared").canComplete)
        assertFalse(byId.getValue("loose").canComplete, "the DB trigger would undo completed_at")
    }

    @Test
    fun `an in-flight tick expires instead of sticking after a killed process`() {
        val now = 1_000_000L
        val entries = setOf("fresh|${now - 1_000}", "orphaned|${now - WidgetState.PENDING_TTL_MS - 1}", "legacy")
        assertEquals(setOf("fresh"), WidgetState.livePending(entries, now).keys)
    }

    @Test
    fun `in-flight completions stay listed, ticked`() {
        val list = build(task("a"), task("b"), completing = setOf("b"))
        assertEquals(listOf(false, true), list.rows.map { it.completing })
    }

    @Test
    fun `rows are capped but the count is not`() {
        val tasks = (1..TasksWidgetModel.MAX_ROWS + 5).map { task("t$it", position = it.toDouble()) }
        val list = build(*tasks.toTypedArray())
        assertEquals(TasksWidgetModel.MAX_ROWS, list.rows.size)
        assertEquals(TasksWidgetModel.MAX_ROWS + 5, list.openCount)
    }
}
