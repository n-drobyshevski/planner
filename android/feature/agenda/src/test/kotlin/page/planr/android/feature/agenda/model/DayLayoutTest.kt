package page.planr.android.feature.agenda.model

import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import org.junit.Test
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus

class DayLayoutTest {
    private val berlin = TimeZone.of("Europe/Berlin")

    private fun block(
        key: String,
        start: String,
        end: String,
        allDay: Boolean = false,
        kind: EventKind = EventKind.Event,
    ) = AgendaBlock(
        key = key,
        eventId = key,
        title = key,
        start = Instant.parse(start),
        end = Instant.parse(end),
        allDay = allDay,
        color = "#c0492a",
        ownership = Ownership.Mine,
        status = EventStatus.Confirmed,
        inactive = false,
        kind = kind,
        isRecurring = false,
        isPrivate = false,
        categoryName = null,
        categoryColor = null,
    )

    private fun seg(key: String, from: Int, to: Int) = Segment(block(key, "2026-10-05T00:00:00Z", "2026-10-05T01:00:00Z"), from, to)

    @Test
    fun `overlapping blocks share a cluster and take lanes`() {
        val laid = layoutDay(listOf(seg("a", 540, 600), seg("b", 570, 660), seg("c", 600, 630), seg("d", 700, 760)))
            .associateBy { it.block.key }

        assertEquals(0, laid.getValue("a").lane)
        assertEquals(1, laid.getValue("b").lane)
        assertEquals(0, laid.getValue("c").lane, "c starts when a ends, so it reuses lane 0")
        listOf("a", "b", "c").forEach { assertEquals(2, laid.getValue(it).lanes) }
        assertEquals(1, laid.getValue("d").lanes, "d starts after the cluster ends")
    }

    @Test
    fun `short blocks are widened for overlap like they are drawn`() {
        val laid = layoutDay(listOf(seg("a", 540, 545), seg("b", 550, 600))).associateBy { it.block.key }
        assertEquals(2, laid.getValue("b").lanes)
        assertEquals(1, laid.getValue("b").lane)
    }

    @Test
    fun `timed blocks are clipped to each local day they touch`() {
        val overnight = block("night", "2026-10-04T20:00:00Z", "2026-10-05T06:00:00Z") // 22:00 → 08:00 Berlin
        val days = listOf(LocalDate(2026, 10, 4), LocalDate(2026, 10, 5))

        val schedule = scheduleDays(listOf(overnight), days, berlin)

        val first = schedule.getValue(days[0]).timed.single()
        assertEquals(22 * 60, first.startMinute)
        assertEquals(MINUTES_PER_DAY, first.endMinute)
        val second = schedule.getValue(days[1]).timed.single()
        assertEquals(0, second.startMinute)
        assertEquals(8 * 60, second.endMinute)
    }

    @Test
    fun `all-day blocks cover their UTC dates, end exclusive`() {
        val trip = block("trip", "2026-10-04T00:00:00Z", "2026-10-06T00:00:00Z", allDay = true)
        val days = listOf(LocalDate(2026, 10, 3), LocalDate(2026, 10, 4), LocalDate(2026, 10, 5), LocalDate(2026, 10, 6))

        val schedule = scheduleDays(listOf(trip), days, berlin)

        assertEquals(listOf(false, true, true, false), days.map { schedule.getValue(it).allDay.isNotEmpty() })
        assertTrue(days.all { schedule.getValue(it).timed.isEmpty() })
    }

    @Test
    fun `contexts are backdrops, not event blocks`() {
        val focus = block("focus", "2026-10-05T07:00:00Z", "2026-10-05T11:00:00Z", kind = EventKind.Context)
        val day = scheduleDays(listOf(focus), listOf(LocalDate(2026, 10, 5)), berlin).values.single()
        assertEquals(1, day.contexts.size)
        assertTrue(day.timed.isEmpty())
    }
}
