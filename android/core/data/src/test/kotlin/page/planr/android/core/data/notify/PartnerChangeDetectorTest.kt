package page.planr.android.core.data.notify

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.sync.RowGone
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.PlannerEvent

/** Which cache changes are the partner's, and worth a notification. */
class PartnerChangeDetectorTest {
    private val now = Instant.parse("2026-10-07T09:00:00Z")
    private val scope = PartnerScope(ME, PARTNER, sleepCategoryId = SLEEP, now = now, since = Instant.parse("2026-10-01T00:00:00Z"), zone = TimeZone.of("Europe/Berlin"))

    private fun event(
        id: String = "e1",
        start: Instant = now + 10.hours,
        end: Instant = start + 1.hours,
        by: String? = PARTNER,
        owner: String = PARTNER,
        title: String = "Dinner",
        status: EventStatus = EventStatus.Confirmed,
        allDay: Boolean = false,
        inactive: Boolean = false,
        private: Boolean = false,
        kind: EventKind = EventKind.Event,
        category: String? = null,
        rrule: String? = null,
        updatedAt: Instant = now,
    ) = PlannerEvent(
        id = id,
        workspaceId = "ws",
        ownerId = owner,
        categoryId = category,
        title = title,
        isPrivate = private,
        kind = kind,
        allDay = allDay,
        inactive = inactive,
        status = status,
        start = start,
        end = end,
        timeZone = "Europe/Berlin",
        rrule = rrule,
        createdAt = now,
        updatedAt = updatedAt,
        updatedBy = by,
    )

    @Test
    fun `a row new to the cache is added`() {
        val change = PartnerChangeDetector.changed(null, event(), scope)
        assertEquals(PartnerChange(PartnerChange.Kind.Added, "e1", "Dinner", now + 10.hours, now + 11.hours), change)
    }

    @Test
    fun `a new start is a move, from where it was`() {
        val before = event()
        val after = event(start = now + 12.hours)
        val change = PartnerChangeDetector.changed(before, after, scope)
        assertEquals(PartnerChange.Kind.Moved, change?.kind)
        assertEquals(now + 10.hours, change?.previousStart)
        assertEquals(now + 11.hours, change?.previousEnd)
    }

    @Test
    fun `a new end alone is a resize, not a move to where it already started`() {
        val change = PartnerChangeDetector.changed(event(), event(end = now + 13.hours), scope)
        assertEquals(
            PartnerChange(
                PartnerChange.Kind.Resized,
                "e1",
                "Dinner",
                start = now + 10.hours,
                end = now + 13.hours,
                previousStart = now + 10.hours,
                previousEnd = now + 11.hours,
            ),
            change,
        )
    }

    @Test
    fun `turning cancelled is a cancellation, other edits say nothing`() {
        val before = event()
        assertEquals(PartnerChange.Kind.Cancelled, PartnerChangeDetector.changed(before, event(status = EventStatus.Cancelled), scope)?.kind)
        assertNull(PartnerChangeDetector.changed(before, event(title = "Supper"), scope), "a rename")
        assertNull(PartnerChangeDetector.changed(event(status = EventStatus.Cancelled), event(status = EventStatus.Cancelled, start = now + 12.hours), scope))
        assertNull(PartnerChangeDetector.changed(null, event(status = EventStatus.Cancelled), scope), "added cancelled")
    }

    @Test
    fun `only the partner's writes count, not the viewer's own or unknown ones`() {
        assertNull(PartnerChangeDetector.changed(null, event(by = ME), scope))
        assertNull(PartnerChangeDetector.changed(null, event(by = null), scope))
        assertNull(PartnerChangeDetector.changed(null, event(), scope.copy(partnerId = ME)))
        assertEquals(PartnerChange.Kind.Added, PartnerChangeDetector.changed(null, event(owner = ME), scope)?.kind, "the partner editing a shared event of mine")
    }

    @Test
    fun `edits from before it was turned on are never reported`() {
        assertNull(PartnerChangeDetector.changed(null, event(updatedAt = Instant.parse("2026-09-30T00:00:00Z")), scope))
    }

    @Test
    fun `only changes touching the next 48 hours count`() {
        assertNull(PartnerChangeDetector.changed(null, event(start = now - 1.hours), scope), "already started")
        assertNull(PartnerChangeDetector.changed(null, event(start = now + 49.hours), scope), "too far ahead")
        assertEquals(PartnerChange.Kind.Added, PartnerChangeDetector.changed(null, event(start = now + 47.hours), scope)?.kind)
        // Moved out of the window: still news, it was within it.
        assertEquals(PartnerChange.Kind.Moved, PartnerChangeDetector.changed(event(), event(start = now + 72.hours), scope)?.kind)
        // An all-day event today (anchored to UTC midnight, so already "started").
        val today = Instant.parse("2026-10-07T00:00:00Z")
        assertEquals(
            PartnerChange.Kind.Added,
            PartnerChangeDetector.changed(null, event(start = today, end = today + 24.hours, allDay = true), scope)?.kind,
        )
    }

    @Test
    fun `an all-day event's day is judged against the viewer's own today, whatever their offset`() {
        fun allDay(day: String, days: Int = 1) =
            Instant.parse("${day}T00:00:00Z").let { event(start = it, end = it + (24 * days).hours, allDay = true) }

        // Los Angeles, 18:00 on Wed 7 Oct (01:00 on the 8th in UTC): the 7th is still today.
        val la = scope.copy(now = Instant.parse("2026-10-08T01:00:00Z"), zone = TimeZone.of("America/Los_Angeles"))
        assertEquals(PartnerChange.Kind.Added, PartnerChangeDetector.changed(null, allDay("2026-10-07"), la)?.kind)
        assertEquals(PartnerChange.Kind.Cancelled, PartnerChangeDetector.changed(allDay("2026-10-07"), allDay("2026-10-07").copy(status = EventStatus.Cancelled), la)?.kind)
        val gone = RowGone("events", "e1", RowGone.Kind.Delete, PARTNER, PARTNER, "Dinner", Instant.parse("2026-10-07T00:00:00Z"), Instant.parse("2026-10-08T00:00:00Z"))
        assertEquals(PartnerChange.Kind.Removed, PartnerChangeDetector.removed(allDay("2026-10-07"), gone, la)?.kind)
        assertEquals(PartnerChange.Kind.Added, PartnerChangeDetector.changed(null, allDay("2026-10-09"), la)?.kind, "the window's last day")
        assertNull(PartnerChangeDetector.changed(null, allDay("2026-10-10"), la))

        // Moscow, 01:00 on Thu 8 Oct (22:00 on the 7th in UTC): the 7th is over, the 10th is in the window.
        val moscow = scope.copy(now = Instant.parse("2026-10-07T22:00:00Z"), zone = TimeZone.of("Europe/Moscow"))
        assertNull(PartnerChangeDetector.changed(null, allDay("2026-10-07"), moscow), "yesterday")
        assertEquals(PartnerChange.Kind.Added, PartnerChangeDetector.changed(null, allDay("2026-10-07", days = 2), moscow)?.kind, "ends today")
        assertEquals(PartnerChange.Kind.Added, PartnerChangeDetector.changed(null, allDay("2026-10-10"), moscow)?.kind)
    }

    @Test
    fun `sleep, inactive blocks, contexts, private rows and series are left out`() {
        assertNull(PartnerChangeDetector.changed(null, event(owner = ME, category = SLEEP), scope), "the viewer's sleep")
        assertNull(PartnerChangeDetector.changed(null, event(title = "Sleep"), scope), "the partner's sleep block")
        assertNull(PartnerChangeDetector.changed(null, event(title = "Сон"), scope))
        assertNull(PartnerChangeDetector.changed(null, event(inactive = true), scope))
        assertNull(PartnerChangeDetector.changed(null, event(kind = EventKind.Context), scope))
        assertNull(PartnerChangeDetector.changed(null, event(private = true), scope))
        assertNull(PartnerChangeDetector.changed(null, event(rrule = "FREQ=DAILY"), scope))
        assertNull(PartnerChangeDetector.changed(event(rrule = "FREQ=DAILY"), event(), scope), "a series made single")
    }

    @Test
    fun `a delete by the partner is a removal, with what the broadcast carries`() {
        val gone = RowGone("events", "e1", RowGone.Kind.Delete, ownerId = PARTNER, actor = PARTNER, title = "Dinner", start = now + 10.hours, end = now + 11.hours)

        assertEquals(
            PartnerChange(PartnerChange.Kind.Removed, "e1", "Dinner", now + 10.hours, now + 11.hours),
            PartnerChangeDetector.removed(null, gone, scope),
        )
        assertEquals(PartnerChange.Kind.Removed, PartnerChangeDetector.removed(event(), gone, scope)?.kind)
    }

    @Test
    fun `removals by the viewer, of private rows, out of the window or of sleep are left out`() {
        val gone = RowGone("events", "e1", RowGone.Kind.Delete, ownerId = PARTNER, actor = PARTNER, title = "Dinner", start = now + 10.hours, end = now + 11.hours)

        assertNull(PartnerChangeDetector.removed(null, gone.copy(actor = ME), scope))
        assertNull(PartnerChangeDetector.removed(null, gone.copy(actor = null), scope), "a service write")
        assertNull(PartnerChangeDetector.removed(null, gone.copy(title = null), scope), "a private row carries no title")
        assertNull(PartnerChangeDetector.removed(null, gone.copy(kind = RowGone.Kind.Hidden), scope))
        assertNull(PartnerChangeDetector.removed(null, gone.copy(table = "tasks"), scope))
        assertNull(PartnerChangeDetector.removed(null, gone.copy(start = now + 50.hours, end = now + 51.hours), scope))
        assertNull(PartnerChangeDetector.removed(event(inactive = true), gone, scope), "a sleep block, as cached")
        assertNull(PartnerChangeDetector.removed(event(rrule = "FREQ=WEEKLY"), gone, scope), "a series")
        assertNull(PartnerChangeDetector.removed(null, gone.copy(title = "Sleep"), scope), "the partner's sleep block, not cached")
        assertNull(PartnerChangeDetector.removed(null, gone.copy(title = "Сон"), scope))
    }

    private companion object {
        const val ME = "member-me"
        const val PARTNER = "member-partner"
        const val SLEEP = "cat-sleep"
    }
}
