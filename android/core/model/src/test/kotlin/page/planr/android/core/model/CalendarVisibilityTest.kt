package page.planr.android.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject

class CalendarVisibilityTest {
    private val me = "member-a"
    private val partner = "member-b"

    private fun occurrence(key: String, owner: String, isShared: Boolean = false) = Occurrence(
        key = key,
        eventId = key,
        occurrenceDate = Instant.parse("2026-10-05T08:00:00Z"),
        start = Instant.parse("2026-10-05T08:00:00Z"),
        end = Instant.parse("2026-10-05T09:00:00Z"),
        allDay = false,
        inactive = false,
        status = EventStatus.Confirmed,
        title = key,
        description = null,
        location = null,
        categoryId = null,
        color = null,
        kind = EventKind.Event,
        ownerId = owner,
        isPrivate = false,
        isShared = isShared,
        hiddenFromPublic = false,
        taskId = null,
        attributes = JsonObject(emptyMap()),
        isRecurring = false,
        isException = false,
    )

    private val all = listOf(
        occurrence("mine", me),
        occurrence("theirs", partner),
        occurrence("joint", partner, isShared = true),
    )

    @Test
    fun `with the partner shown, everything shows`() {
        assertEquals(listOf("mine", "theirs", "joint"), CalendarVisibility.filter(all, me, showPartner = true).map { it.key })
    }

    @Test
    fun `with the partner hidden, my own and joint items still show`() {
        assertEquals(listOf("mine", "joint"), CalendarVisibility.filter(all, me, showPartner = false).map { it.key })
    }

    @Test
    fun `an unknown viewer sees everything`() {
        assertEquals(3, CalendarVisibility.filter(all, null, showPartner = false).size)
    }

    @Test
    fun `the partner is the one other member`() {
        val a = Member(id = me, workspaceId = "ws", name = "Anna", color = "#c0492a")
        val b = Member(id = partner, workspaceId = "ws", name = "Boris", color = "#0f766e")
        assertEquals(b, CalendarVisibility.partnerOf(listOf(a, b), me))
        assertNull(CalendarVisibility.partnerOf(listOf(a), me))
        assertNull(CalendarVisibility.partnerOf(listOf(a, b), null))
    }
}
