package page.planr.android.feature.agenda.model

import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.days
import kotlinx.datetime.TimeZone
import org.junit.Test
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.DefaultRecurrenceExpander
import page.planr.android.feature.agenda.Fixtures

class AgendaBlockTest {
    private val members = listOf(Fixtures.anna, Fixtures.boris).associateBy { it.id }
    private val categories = listOf(Fixtures.work, Fixtures.home).associateBy { it.id }

    private fun occurrenceOf(event: PlannerEvent): Occurrence = DefaultRecurrenceExpander.expandEvent(
        event,
        emptyList(),
        TimeWindow(event.start - 1.days, event.end + 1.days),
        setOf(Fixtures.home.id),
    ).single()

    private fun blockOf(event: PlannerEvent, viewer: String = Fixtures.ANNA) =
        agendaBlockOf(occurrenceOf(event), viewer, members, categories)

    @Test
    fun `each member's events take their own color`() {
        assertEquals("#c0492a", blockOf(Fixtures.event(owner = Fixtures.ANNA)).color)
        assertEquals("#0f766e", blockOf(Fixtures.event(owner = Fixtures.BORIS)).color)
    }

    @Test
    fun `item color beats context color beats member color`() {
        assertEquals("#0369a1", blockOf(Fixtures.event(categoryId = Fixtures.work.id)).color)
        assertEquals("#be185d", blockOf(Fixtures.event(categoryId = Fixtures.work.id, color = "#be185d")).color)
        assertEquals(FALLBACK_BLOCK_COLOR, blockOf(Fixtures.event(owner = "someone-else")).color)
    }

    @Test
    fun `ownership is mine, shared or theirs from the viewer's side`() {
        assertEquals(Ownership.Mine, blockOf(Fixtures.event(owner = Fixtures.ANNA)).ownership)
        assertEquals(Ownership.Theirs, blockOf(Fixtures.event(owner = Fixtures.BORIS)).ownership)
        assertEquals(Ownership.Shared, blockOf(Fixtures.event(owner = Fixtures.BORIS, isShared = true)).ownership)
        // A shared context makes its events joint.
        val inShared = blockOf(Fixtures.event(owner = Fixtures.BORIS, categoryId = Fixtures.home.id))
        assertEquals(Ownership.Shared, inShared.ownership)
        assertEquals("Home", inShared.categoryName)
    }

    @Test
    fun `viewer zone falls back to the device when the member has none or a bad one`() {
        assertEquals(TimeZone.of("Europe/Berlin"), viewerZone(Fixtures.anna))
        assertEquals(TimeZone.currentSystemDefault(), viewerZone(Fixtures.anna.copy(timezone = "Not/AZone")))
        assertEquals(TimeZone.currentSystemDefault(), viewerZone(null))
    }
}
