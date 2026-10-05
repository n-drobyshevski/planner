package page.planr.android.feature.agenda.model

import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Instant
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.model.EventKind

/** Minutes in a drawn day; DST days are drawn on the same 24-hour grid. */
const val MINUTES_PER_DAY = 24 * 60

/**
 * A timed block placed in one day column: its vertical span in minutes from
 * local midnight and its lane among overlapping blocks.
 */
data class PositionedBlock(
    val block: AgendaBlock,
    val startMinute: Int,
    val endMinute: Int,
    /** 0-based lane and the lane count of its overlap cluster (width = 1 / [lanes]). */
    val lane: Int,
    val lanes: Int,
)

/** One day of the agenda: all-day chips, context backdrops and laid-out timed blocks. */
data class DaySchedule(
    val date: LocalDate,
    val allDay: List<AgendaBlock>,
    val contexts: List<PositionedBlock>,
    val timed: List<PositionedBlock>,
) {
    val isEmpty: Boolean get() = allDay.isEmpty() && timed.isEmpty() && contexts.isEmpty()

    companion object {
        fun empty(date: LocalDate) = DaySchedule(date, emptyList(), emptyList(), emptyList())
    }
}

/** Shortest drawn block, so a 5-minute event still has a tappable, legible slab. */
const val MIN_BLOCK_MINUTES = 20

/**
 * Buckets [blocks] into [days] (in [zone]). All-day blocks are floating dates
 * anchored to UTC midnight (the same date for everyone), so their dates are
 * read in UTC; timed blocks are clipped to each local day they touch.
 */
fun scheduleDays(blocks: List<AgendaBlock>, days: List<LocalDate>, zone: TimeZone): Map<LocalDate, DaySchedule> {
    return days.associateWith { date ->
        val dayStart = date.atStartOfDayIn(zone)
        val dayEnd = date.plus(1, DateTimeUnit.DAY).atStartOfDayIn(zone)
        val allDay = mutableListOf<AgendaBlock>()
        val contexts = mutableListOf<Segment>()
        val timed = mutableListOf<Segment>()
        for (block in blocks) {
            if (block.allDay) {
                if (coversUtcDate(block, date)) allDay += block
                continue
            }
            // Half-open overlap; a zero-length block still shows on the day of its start.
            val overlaps = if (block.end > block.start) {
                block.start < dayEnd && block.end > dayStart
            } else {
                block.start >= dayStart && block.start < dayEnd
            }
            if (!overlaps) continue
            val segment = Segment(
                block,
                minuteOfDay(maxOf(block.start, dayStart), dayStart, zone),
                if (block.end >= dayEnd) MINUTES_PER_DAY else minuteOfDay(block.end, dayStart, zone),
            )
            if (block.kind == EventKind.Context) contexts += segment else timed += segment
        }
        DaySchedule(
            date = date,
            allDay = allDay.sortedWith(compareBy({ it.start }, { it.title })),
            contexts = layoutDay(contexts),
            timed = layoutDay(timed),
        )
    }
}

/** A block's raw span within one day, before lanes are assigned. */
data class Segment(val block: AgendaBlock, val startMinute: Int, val endMinute: Int)

/**
 * Lays overlapping segments side by side: segments that transitively overlap
 * form a cluster; each takes the first free lane, and every member of a
 * cluster shares its lane count. Spans shorter than [MIN_BLOCK_MINUTES] are
 * widened for overlap purposes, matching how they are drawn.
 */
fun layoutDay(segments: List<Segment>): List<PositionedBlock> {
    val sorted = segments.sortedWith(
        compareBy<Segment>({ it.startMinute }, { -(it.endMinute - it.startMinute) }, { it.block.title }, { it.block.key }),
    )
    val result = mutableListOf<PositionedBlock>()
    val cluster = mutableListOf<Pair<Segment, Int>>()
    val laneEnds = mutableListOf<Int>()
    var clusterEnd = Int.MIN_VALUE

    fun flush() {
        val lanes = laneEnds.size
        cluster.forEach { (s, lane) -> result += PositionedBlock(s.block, s.startMinute, s.endMinute, lane, lanes) }
        cluster.clear()
        laneEnds.clear()
    }

    for (segment in sorted) {
        val visualEnd = maxOf(segment.endMinute, segment.startMinute + MIN_BLOCK_MINUTES)
        if (segment.startMinute >= clusterEnd) flush()
        val free = laneEnds.indexOfFirst { it <= segment.startMinute }
        val lane = if (free >= 0) free else laneEnds.size
        if (free >= 0) laneEnds[free] = visualEnd else laneEnds += visualEnd
        cluster += segment to lane
        clusterEnd = maxOf(clusterEnd, visualEnd)
    }
    flush()
    return result
}

private fun minuteOfDay(instant: Instant, dayStart: Instant, zone: TimeZone): Int {
    val local = instant.toLocalDateTime(zone)
    val sameDay = local.date == dayStart.toLocalDateTime(zone).date
    return if (sameDay) local.hour * 60 + local.minute else MINUTES_PER_DAY
}

/** Whether an all-day [block] covers [date]: `[start, end)` read as UTC dates. */
private fun coversUtcDate(block: AgendaBlock, date: LocalDate): Boolean {
    val first = block.start.toLocalDateTime(TimeZone.UTC).date
    // `end` is exclusive (the next midnight); a zero-length all-day block still covers its day.
    val lastInstant = if (block.end > block.start) block.end - 1.milliseconds else block.start
    val last = lastInstant.toLocalDateTime(TimeZone.UTC).date
    return date in first..last
}
