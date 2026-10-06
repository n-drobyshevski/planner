package page.planr.android.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject

class CalendarVisibilityTest {
    private val me = "member-a"
    private val partner = "member-b"

    private fun occurrence(
        key: String,
        owner: String,
        isShared: Boolean = false,
        categoryId: String? = null,
        kind: EventKind = EventKind.Event,
    ) = Occurrence(
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
        categoryId = categoryId,
        color = null,
        kind = kind,
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

    // The cases below are test/visibility.test.ts's `filterVisible` ones, with
    // the web's (viewerId, overlayMemberIds, hiddenCategoryIds, selfHidden)
    // as (viewer, showPartner, hiddenCategoryIds, ownHidden).

    @Test
    fun `the full filter keeps my own items and the partner's only while overlaid`() {
        val partnerHidden = CalendarFilter(showPartner = false)
        assertEquals(listOf("mine", "joint"), CalendarVisibility.filter(all, me, partnerHidden).map { it.key })
        assertEquals(all, CalendarVisibility.filter(all, me, CalendarFilter()))
    }

    @Test
    fun `hiding my own calendar keeps joint items and the partner's`() {
        val filter = CalendarFilter(ownHidden = true)
        assertEquals(listOf("theirs", "joint"), CalendarVisibility.filter(all, me, filter).map { it.key })
        // Both hidden: only what we share is left.
        assertEquals(listOf("joint"), CalendarVisibility.filter(all, me, filter.copy(showPartner = false)).map { it.key })
    }

    @Test
    fun `a hidden context hides its items whoever's they are, joint ones and backdrops too`() {
        val items = listOf(
            occurrence("mine-work", me, categoryId = "cat-x"),
            occurrence("joint-work", partner, isShared = true, categoryId = "cat-x"),
            occurrence("window", me, categoryId = "cat-x", kind = EventKind.Context),
            occurrence("mine-home", me, categoryId = "cat-y"),
            occurrence("loose", me),
        )
        val filter = CalendarFilter(hiddenCategoryIds = setOf("cat-x"))
        // An item with no context is never hidden by one.
        assertEquals(listOf("mine-home", "loose"), CalendarVisibility.filter(items, me, filter).map { it.key })
        assertFalse(CalendarVisibility.isVisible(items[1], null, filter))
    }

    @Test
    fun `the filter narrows only through the own calendar or a context that still exists`() {
        assertFalse(CalendarFilter().narrows(listOf("cat-x")))
        // The partner has its own toggle in the header.
        assertFalse(CalendarFilter(showPartner = false).narrows(listOf("cat-x")))
        assertTrue(CalendarFilter(ownHidden = true).narrows(emptyList()))
        assertTrue(CalendarFilter(hiddenCategoryIds = setOf("cat-x")).narrows(listOf("cat-x", "cat-y")))
        // A deleted context's id lingering in the set hides nothing.
        assertFalse(CalendarFilter(hiddenCategoryIds = setOf("cat-gone")).narrows(listOf("cat-x")))
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
