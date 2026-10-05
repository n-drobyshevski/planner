package page.planr.android.core.recurrence

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Instant
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow

/** Expansion behavior beyond the golden fixtures (which cover the main matrix). */
class DefaultRecurrenceExpanderTest {

    private val expander = DefaultRecurrenceExpander

    private fun at(iso: String) = Instant.parse(iso)

    private fun event(
        id: String = "e1",
        title: String = "Standup",
        start: String = "2026-04-06T07:00:00Z",
        end: String = "2026-04-06T07:30:00Z",
        rrule: String? = "FREQ=DAILY",
        timeZone: String = "Europe/Berlin",
    ) = PlannerEvent(
        id = id, workspaceId = "w", ownerId = "m", title = title,
        start = at(start), end = at(end), timeZone = timeZone, rrule = rrule,
        createdAt = at("2026-01-01T00:00:00Z"), updatedAt = at("2026-01-01T00:00:00Z"),
    )

    private fun override(occurrenceDate: String, type: OverrideType, title: String? = null, start: String? = null) =
        EventOverride(
            id = "o-$occurrenceDate-$title", workspaceId = "w", eventId = "e1",
            occurrenceDate = at(occurrenceDate), type = type, title = title, start = start?.let(::at),
        )

    private val week = TimeWindow(at("2026-04-06T00:00:00Z"), at("2026-04-13T00:00:00Z"))

    @Test
    fun `an empty rrule is a single event, as on the web`() {
        val occurrences = expander.expand(listOf(event(rrule = "")), emptyList(), week)

        assertEquals(listOf("e1"), occurrences.map { it.key })
        assertEquals(false, occurrences.single().isRecurring)
    }

    @Test
    fun `recurring keys are the event id plus the original start in epoch ms`() {
        val first = expander.expand(listOf(event()), emptyList(), week).first()

        assertEquals("e1:${at("2026-04-06T07:00:00Z").toEpochMilliseconds()}", first.key)
    }

    @Test
    fun `a later override row for the same occurrence wins`() {
        val overrides = listOf(
            override("2026-04-07T07:00:00Z", OverrideType.Modify, title = "First"),
            override("2026-04-07T07:00:00Z", OverrideType.Modify, title = "Second"),
        )

        val occurrences = expander.expand(listOf(event()), overrides, week)

        assertEquals("Second", occurrences.single { it.occurrenceDate == at("2026-04-07T07:00:00Z") }.title)
    }

    @Test
    fun `overrides of other events are ignored`() {
        val foreign = override("2026-04-07T07:00:00Z", OverrideType.Cancel).copy(eventId = "other")

        assertEquals(7, expander.expand(listOf(event()), listOf(foreign), week).size)
    }

    @Test
    fun `a moved occurrence keeps its original key and sorts by its new start`() {
        val moved = override("2026-04-08T07:00:00Z", OverrideType.Modify, start = "2026-04-07T06:00:00Z")

        val occurrences = expander.expand(listOf(event()), listOf(moved), week)
        val exception = occurrences[1]

        assertEquals(at("2026-04-07T06:00:00Z"), exception.start)
        assertEquals("e1:${at("2026-04-08T07:00:00Z").toEpochMilliseconds()}", exception.key)
        assertTrue(exception.isException)
    }

    @Test
    fun `ties on start sort by title, then key`() {
        val events = listOf(event(id = "b", title = "Beta", rrule = null), event(id = "a", title = "Alpha", rrule = null))

        assertEquals(listOf("a", "b"), expander.expand(events, emptyList(), week).map { it.key })
    }

    @Test
    fun `the window is half-open`() {
        val window = TimeWindow(at("2026-04-06T07:30:00Z"), at("2026-04-07T07:00:00Z"))

        assertTrue(expander.expand(listOf(event()), emptyList(), window).isEmpty())
    }

    @Test
    fun `an unknown time zone fails loudly, like the web`() {
        assertFailsWith<IllegalArgumentException> {
            expander.expand(listOf(event(timeZone = "Mars/Olympus")), emptyList(), week)
        }
    }
}
