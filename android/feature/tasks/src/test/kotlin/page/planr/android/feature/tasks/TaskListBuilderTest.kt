package page.planr.android.feature.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.datetime.LocalDate
import page.planr.android.feature.tasks.model.SubtaskProgress
import page.planr.android.feature.tasks.model.TaskFilters
import page.planr.android.feature.tasks.model.TaskGroupKey
import page.planr.android.feature.tasks.model.TaskListBuilder
import page.planr.android.feature.tasks.model.TaskScope
import page.planr.android.feature.tasks.model.TaskStateFilter
import page.planr.android.core.model.Task

class TaskListBuilderTest {

    private fun build(
        tasks: List<Task>,
        filters: TaskFilters = TaskFilters(),
        overrides: Map<String, Boolean> = emptyMap(),
    ) = TaskListBuilder.build(
        tasks = tasks,
        members = listOf(anna, boris),
        categories = listOf(sharedHome, annaWork),
        viewerId = ANNA,
        filters = filters,
        today = TODAY,
        doneOverrides = overrides,
    )

    @Test
    fun `open tasks are bucketed by due date like the backlog`() {
        val groups = build(
            listOf(
                task("none"),
                task("later", due = LocalDate(2026, 10, 12)),
                task("week-edge", due = LocalDate(2026, 10, 11)),
                task("today", due = TODAY),
                task("overdue", due = LocalDate(2026, 10, 3)),
            ),
        )
        assertEquals(
            listOf(TaskGroupKey.Overdue, TaskGroupKey.ThisWeek, TaskGroupKey.Later, TaskGroupKey.NoDate),
            groups.map { it.key },
        )
        assertEquals(listOf("today", "week-edge"), groups[1].items.map { it.task.id })
        assertTrue(groups[0].items.single().overdue)
        assertFalse(groups[1].items.first().overdue, "due today is not overdue")
    }

    @Test
    fun `within a bucket soonest due wins, then higher priority, then position`() {
        val groups = build(
            listOf(
                task("b", due = TODAY, priority = 1, position = 1.0),
                task("a", due = TODAY, priority = 3, position = 2.0),
                task("c", due = TODAY, priority = 1, position = 0.0),
                task("d", due = LocalDate(2026, 10, 5), priority = 3),
            ),
        )
        assertEquals(listOf("a", "c", "b", "d"), groups.single().items.map { it.task.id })
    }

    @Test
    fun `state filter picks open, done or both with done last`() {
        val tasks = listOf(task("open"), task("done", done = true))
        assertEquals(listOf("open"), build(tasks).flatMap { g -> g.items.map { it.task.id } })
        assertEquals(
            listOf(TaskGroupKey.Done),
            build(tasks, TaskFilters(state = TaskStateFilter.Done)).map { it.key },
        )
        assertEquals(
            listOf(TaskGroupKey.NoDate, TaskGroupKey.Done),
            build(tasks, TaskFilters(state = TaskStateFilter.All)).map { it.key },
        )
    }

    @Test
    fun `scope goes by the assignee, else the owner, and shared means a shared context`() {
        val tasks = listOf(
            task("mine"),
            task("assigned-to-me", owner = BORIS, assignee = ANNA),
            task("boris", owner = BORIS),
            task("handed-to-boris", assignee = BORIS),
            task("home", owner = BORIS, category = sharedHome.id),
            task("work", category = annaWork.id),
        )
        fun ids(scope: TaskScope) = build(tasks, TaskFilters(scope = scope)).flatMap { g -> g.items.map { it.task.id } }.toSet()

        assertEquals(setOf("mine", "assigned-to-me", "work"), ids(TaskScope.Mine))
        assertEquals(setOf("boris", "handed-to-boris", "home"), ids(TaskScope.Partner))
        assertEquals(setOf("home"), ids(TaskScope.Shared))
        assertEquals(tasks.map { it.id }.toSet(), ids(TaskScope.All))
    }

    @Test
    fun `subtasks roll up into their parent's progress instead of listing`() {
        val groups = build(
            listOf(
                task("parent"),
                task("child-1", parent = "parent", done = true),
                task("child-2", parent = "parent"),
                task("grandchild", parent = "child-2", done = true),
                task("orphan", parent = "hidden-parent"),
            ),
        )
        val items = groups.flatMap { it.items }
        assertEquals(setOf("parent", "orphan"), items.map { it.task.id }.toSet())
        assertEquals(SubtaskProgress(done = 2, total = 3), items.first { it.task.id == "parent" }.progress)
    }

    @Test
    fun `color, edit rights and optimistic completion are resolved per row`() {
        val items = build(
            listOf(
                task("own", category = annaWork.id),
                task("partners", owner = BORIS),
                task("assigned", assignee = BORIS),
            ),
            overrides = mapOf("own" to true),
        ).flatMap { it.items }.associateBy { it.task.id }

        assertEquals(annaWork.color, items.getValue("own").colorHex)
        assertEquals(boris.color, items.getValue("partners").colorHex)
        assertEquals(boris.color, items.getValue("assigned").colorHex, "the assignee's color wins over the owner's")
        assertTrue(items.getValue("own").canEdit)
        assertFalse(items.getValue("partners").canEdit)
        assertTrue(items.getValue("own").done, "an in-flight completion shows as checked")
    }
}
