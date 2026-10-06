package page.planr.android.feature.agenda.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.test.assertEquals
import kotlin.time.Instant
import org.junit.Test
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.feature.agenda.model.AgendaBlock
import page.planr.android.feature.agenda.model.Ownership
import page.planr.android.feature.agenda.model.PositionedBlock

class AgendaMetricsTest {
    private fun metrics(fontScale: Float) = agendaMetrics(fontScale, timeLineHeight = 13.sp, labelLineHeight = 13.sp)

    private fun assertDp(expected: Float, actual: Dp) = assertEquals(expected, actual.value, 0.01f)

    private fun positioned(startMinute: Int, endMinute: Int) = PositionedBlock(
        block = AgendaBlock(
            key = "a",
            eventId = "a",
            title = "a",
            start = Instant.parse("2026-10-05T00:00:00Z"),
            end = Instant.parse("2026-10-05T01:00:00Z"),
            allDay = false,
            color = "#c0492a",
            ownership = Ownership.Mine,
            status = EventStatus.Confirmed,
            inactive = false,
            kind = EventKind.Event,
            isRecurring = false,
            isPrivate = false,
            categoryName = null,
            categoryColor = null,
        ),
        startMinute = startMinute,
        endMinute = endMinute,
        lane = 0,
        lanes = 1,
    )

    @Test
    fun `at the default font size the grid keeps its base sizes`() {
        val m = metrics(1f)
        assertDp(52f, m.hourHeight)
        assertDp(44f, m.gutterWidth)
        assertDp(26f, m.dateCircle)
        assertDp(22f, m.allDayChipHeight)
        assertDp(15f, m.titleLine)
        assertDp(13f, m.compactTitleLine)
        assertDp(13f, m.timeLine)
        assertDp(13f, m.hintLine)
    }

    @Test
    fun `a larger font size grows the grid and the lines alike`() {
        val m = metrics(1.3f)
        assertDp(67.6f, m.hourHeight)
        assertDp(57.2f, m.gutterWidth)
        assertDp(33.8f, m.dateCircle)
        assertDp(28.6f, m.allDayChipHeight)
        assertDp(19.5f, m.titleLine)
        assertDp(16.9f, m.timeLine)
    }

    @Test
    fun `at 200 percent the grid stops at 160 percent while lines and the gutter keep up with the text`() {
        val m = metrics(2f)
        assertDp(52f * MAX_GRID_SCALE, m.hourHeight)
        assertDp(26f * MAX_GRID_SCALE, m.dateCircle)
        assertDp(22f * MAX_GRID_SCALE, m.allDayChipHeight)
        assertDp(88f, m.gutterWidth)
        assertDp(30f, m.titleLine)
        assertDp(26f, m.compactTitleLine)
        assertDp(26f, m.timeLine)
        assertEquals(metrics(3f).hourHeight, m.hourHeight)
        assertEquals(metrics(3f).gutterWidth, m.gutterWidth)
    }

    @Test
    fun `a smaller font size keeps the grid but shortens the lines`() {
        val m = metrics(0.85f)
        assertDp(52f, m.hourHeight)
        assertDp(44f, m.gutterWidth)
        assertDp(12.75f, m.titleLine)
    }

    @Test
    fun `a day-view block adds the time, a second title line, then the hint as each fits`() {
        val m = metrics(1f)
        assertEquals(BlockFit(titleLines = 1, showTime = false, showHint = false), m.blockFit(25.dp, compact = false))
        assertEquals(BlockFit(titleLines = 1, showTime = true, showHint = false), m.blockFit(38.dp, compact = false))
        assertEquals(BlockFit(titleLines = 2, showTime = true, showHint = false), m.blockFit(51.dp, compact = false))
        assertEquals(BlockFit(titleLines = 2, showTime = true, showHint = true), m.blockFit(77.dp, compact = false))
    }

    @Test
    fun `fit thresholds are exact sums of the line heights`() {
        val m = metrics(1f)
        // 3 + 15 + 1 + 13 + 3: one title line and the time, nothing to spare.
        assertEquals(true, m.blockFit(35.dp, compact = false).showTime)
        assertEquals(false, m.blockFit(34.9.dp, compact = false).showTime)
        // 3 + 15 * 2 + 1 + 13 + 1 + 13 + 3.
        assertEquals(true, m.blockFit(64.dp, compact = false).showHint)
        assertEquals(false, m.blockFit(63.9.dp, compact = false).showHint)
    }

    @Test
    fun `at 200 percent an hour-long block shows less rather than clipping`() {
        val large = metrics(2f)
        val hour = large.blockHeight(positioned(9 * 60, 10 * 60))
        assertEquals(BlockFit(titleLines = 1, showTime = true, showHint = false), large.blockFit(hour, compact = false))
        assertEquals(BlockFit(titleLines = 2, showTime = true, showHint = false), metrics(1f).blockFit(51.dp, compact = false))
    }

    @Test
    fun `a week-view block counts title lines only`() {
        assertEquals(BlockFit(titleLines = 3, showTime = false, showHint = false), metrics(1f).blockFit(51.dp, compact = true))
        assertEquals(BlockFit(titleLines = 2, showTime = false, showHint = false), metrics(2f).blockFit(82.2.dp, compact = true))
        assertEquals(1, metrics(2f).blockFit(10.dp, compact = true).titleLines)
    }

    @Test
    fun `block placement follows the scaled hour`() {
        val m = metrics(2f)
        assertDp(83.2f * 1.5f, m.offsetOf(90f))
        assertDp(83.2f * 2 - 1, m.blockHeight(positioned(60, 180)))
        // Short spans still get the minimum block height.
        assertDp(83.2f / 3 - 1, m.blockHeight(positioned(60, 65)))
    }

    @Test
    fun `a tap snaps to the half hour under it, within the day`() {
        val hourPx = 52f * MAX_GRID_SCALE * 2.75f // 160% on a 2.75x screen
        assertEquals(0, slotMinuteAt(0f, hourPx))
        assertEquals(0, slotMinuteAt(-5f, hourPx))
        assertEquals(60, slotMinuteAt(hourPx * 1.49f, hourPx))
        assertEquals(90, slotMinuteAt(hourPx * 1.51f, hourPx))
        assertEquals(23 * 60 + 30, slotMinuteAt(hourPx * 24 - 1, hourPx))
        assertEquals(23 * 60 + 30, slotMinuteAt(hourPx * 30, hourPx))
    }

    @Test
    fun `the tapped slot and the block placed there line up`() {
        val m = metrics(1.3f)
        val hourPx = m.hourHeight.value * 3f
        val minute = slotMinuteAt(m.offsetOf(14 * 60 + 40f).value * 3f, hourPx)
        assertEquals(14 * 60 + 30, minute)
        assertDp(m.hourHeight.value * 14.5f, m.offsetOf(minute.toFloat()))
    }

    @Test
    fun `the initial scroll lands on the hour line`() {
        val hourPx = metrics(1.6f).hourHeight.value * 2f
        assertEquals((7 * hourPx).toInt(), scrollOffsetFor(7f, hourPx))
        assertEquals((23 * hourPx).toInt(), scrollOffsetFor(30f, hourPx))
        assertEquals(0, scrollOffsetFor(-1f, hourPx))
    }

    @Test
    fun `a saved grid position keeps its time when the font size changes`() {
        val density = 2.75f
        val before = metrics(1f).hourHeight.value * density
        val after = metrics(2f).hourHeight.value * density
        val hours = gridHoursAt(scrollOffsetFor(9.5f, before), before)
        assertEquals(9.5f, hours, 0.01f)
        // Restored on the taller grid, the same time is at the top, not the same pixels.
        assertEquals(9.5f, gridHoursAt(scrollOffsetFor(hours, after), after), 0.01f)
    }
}
