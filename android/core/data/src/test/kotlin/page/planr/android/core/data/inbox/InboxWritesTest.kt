package page.planr.android.core.data.inbox

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.model.PlannerEventDraft

/** What the Inbox's rows write: the satisfaction merge and the approved request's event. */
class InboxWritesTest {
    private val start = Instant.parse("2026-06-11T15:00:00Z")
    private val end = Instant.parse("2026-06-11T16:00:00Z")

    private fun request(name: String?, message: String? = null) = InboxItem.Request(
        id = "request:r1",
        sortAt = Instant.parse("2026-06-10T14:00:00Z"),
        requestId = "r1",
        requesterName = name,
        message = message,
        proposedStart = start,
        proposedEnd = end,
    )

    @Test
    fun `a rating sets satisfaction as a number and keeps every other key`() {
        val existing = JsonObject(
            mapOf("energy" to JsonPrimitive(2), "icalUid" to JsonPrimitive("u1"), "satisfaction" to JsonPrimitive("junk")),
        )
        val next = InboxRules.rated(existing, "4")
        assertEquals(
            JsonObject(mapOf("energy" to JsonPrimitive(2), "icalUid" to JsonPrimitive("u1"), "satisfaction" to JsonPrimitive(4))),
            next,
        )
    }

    @Test
    fun `the rating rows offer the four satisfaction options`() {
        assertEquals(listOf("1", "2", "3", "4"), InboxRules.satisfactionOptions)
    }

    @Test
    fun `approving creates the viewer's event at the proposed time, titled with the requester`() {
        val draft = InboxRules.approvedEvent(request(" Jordan ", "coffee?"), "ws", "me", "Requested time", TimeZone.of("Europe/Berlin"))
        assertEquals(
            PlannerEventDraft(
                workspaceId = "ws",
                ownerId = "me",
                title = "Jordan",
                description = "coffee?",
                start = start,
                end = end,
                timeZone = "Europe/Berlin",
            ),
            draft,
        )
    }

    @Test
    fun `an anonymous or blank requester gets the default title`() {
        assertEquals("Requested time", InboxRules.approvedEvent(request(null), "ws", "me", "Requested time", TimeZone.UTC).title)
        assertEquals("Requested time", InboxRules.approvedEvent(request("  "), "ws", "me", "Requested time", TimeZone.UTC).title)
    }
}
