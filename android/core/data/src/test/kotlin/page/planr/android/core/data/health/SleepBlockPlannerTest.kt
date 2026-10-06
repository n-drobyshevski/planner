package page.planr.android.core.data.health

import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence

/** Mirrors test/sleep/sync-block.test.ts and the web's night window / viewer-sleep rules. */
class SleepBlockPlannerTest {
    private val berlin = ZoneId.of("Europe/Berlin")
    private val window = SleepBlockPlanner.nightWindow(LocalDate.of(2026, 10, 5), berlin, 20, 12)
    private val bed = Instant.parse("2026-10-04T21:30:00Z")
    private val woke = Instant.parse("2026-10-05T05:00:00Z")

    private fun block(
        id: String,
        start: Instant,
        end: Instant,
        owner: String = "me",
        inactive: Boolean = true,
        categoryId: String? = null,
        recurring: Boolean = false,
        allDay: Boolean = false,
    ) = Occurrence(
        key = id, eventId = id, occurrenceDate = start, start = start, end = end, allDay = allDay,
        inactive = inactive, status = EventStatus.Confirmed, title = id, description = null, location = null,
        categoryId = categoryId, color = null, kind = EventKind.Event, ownerId = owner, isPrivate = false,
        isShared = false, hiddenFromPublic = false, taskId = null, attributes = JsonObject(emptyMap()),
        isRecurring = recurring, isException = false,
    )

    @Test
    fun `the night window runs from the evening before to midday, in the member's zone`() {
        assertEquals(Instant.parse("2026-10-04T18:00:00Z"), window.start) // 20:00 CEST
        assertEquals(Instant.parse("2026-10-05T10:00:00Z"), window.end) // 12:00 CEST
    }

    @Test
    fun `no block creates one at the tracker's times`() {
        assertEquals(SleepBlockPlan.Create(bed, woke), SleepBlockPlanner.plan(bed, woke, emptyList(), window))
    }

    @Test
    fun `a one-off block moves and a routine gets a one-night exception`() {
        val single = block("single", bed - 1.hours, woke - 1.hours)
        assertEquals(SleepBlockPlan.UpdateSingle("single", bed, woke), SleepBlockPlanner.plan(bed, woke, listOf(single), window))

        val routine = block("routine", bed - 30.minutes, woke, recurring = true)
        assertEquals(
            SleepBlockPlan.Override("routine", routine.occurrenceDate, bed, woke),
            SleepBlockPlanner.plan(bed, woke, listOf(routine), window),
        )
    }

    @Test
    fun `the block with the most time in the night wins, the earlier one on a tie`() {
        val nap = block("nap", window.end - 1.hours, window.end + 1.hours) // 1 h inside
        val night = block("night", bed, woke + 30.minutes)
        val plan = SleepBlockPlanner.plan(bed, woke, listOf(nap, night), window)
        assertEquals(SleepBlockPlan.UpdateSingle("night", bed, woke), plan)

        val a = block("a", bed - 2.hours, bed)
        val b = block("b", woke, woke + 2.hours)
        assertEquals("a", (SleepBlockPlanner.plan(bed, woke, listOf(b, a), window) as SleepBlockPlan.UpdateSingle).eventId)
    }

    @Test
    fun `a block already within a minute of the night is left alone`() {
        val same = block("same", bed + 30_000.toDuration(), woke - 20_000.toDuration())
        assertEquals(SleepBlockPlan.Unchanged, SleepBlockPlanner.plan(bed, woke, listOf(same), window))
    }

    @Test
    fun `only the member's own timed sleep counts`() {
        val mine = block("mine", bed, woke)
        assertTrue(SleepBlockPlanner.isViewerSleep(mine, "me", null))
        assertFalse(SleepBlockPlanner.isViewerSleep(block("p", bed, woke, owner = "partner"), "me", null))
        assertFalse(SleepBlockPlanner.isViewerSleep(block("active", bed, woke, inactive = false), "me", null))
        assertFalse(SleepBlockPlanner.isViewerSleep(block("allday", bed, woke, allDay = true), "me", null))
        // With a sleep category, the category decides, not the inactive flag.
        assertTrue(SleepBlockPlanner.isViewerSleep(block("cat", bed, woke, inactive = false, categoryId = "sleep"), "me", "sleep"))
        assertFalse(SleepBlockPlanner.isViewerSleep(mine, "me", "sleep"))
    }

    private fun Int.toDuration() = kotlin.time.Duration.parse("${this}ms")
}
