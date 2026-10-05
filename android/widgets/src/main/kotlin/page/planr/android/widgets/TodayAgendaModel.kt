package page.planr.android.widgets

import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Instant
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/** Today, as the Today widget draws it. */
internal data class TodayAgenda(val date: LocalDate, val rows: List<AgendaRow>)

/** One occurrence row: whose (the bar), when, what. */
internal data class AgendaRow(
    /** Occurrence key: the event detail route takes it as is. */
    val key: String,
    val title: String,
    val time: RowTime,
    val tone: MemberTone,
    val cancelled: Boolean,
    val inactive: Boolean,
)

/** The row's time label. */
internal sealed interface RowTime {
    /** All-day, or timed but covering the whole day. */
    data object AllDay : RowTime

    data class Starts(val at: LocalTime) : RowTime

    /** Began on an earlier day and ends today. */
    data class Until(val at: LocalTime) : RowTime
}

/**
 * Whose an occurrence is, for the colour bar: joint ones are shared amber,
 * otherwise the owner's member colour (Member A is the older member, as the
 * web orders them). [hex] is the member's own `members.color`, when set.
 */
internal data class MemberTone(val slot: Slot, val hex: String? = null) {
    enum class Slot { MemberA, MemberB, Shared, Neutral }

    companion object {
        val Shared = MemberTone(Slot.Shared)
        val Neutral = MemberTone(Slot.Neutral)
    }
}

/** Builds [TodayAgenda] from expanded occurrences. Pure, so it is unit-tested directly. */
internal object TodayAgendaModel {

    /** Local midnight to the next local midnight (23 or 25 hours across a DST change). */
    fun dayWindow(day: LocalDate, zone: TimeZone): TimeWindow =
        TimeWindow(day.atStartOfDayIn(zone), day.plus(1, DateTimeUnit.DAY).atStartOfDayIn(zone))

    /**
     * Rows for [day]: all-day first, then by start, title and key. Contexts
     * (background bands such as "At work") aren't events, so they are left out.
     * Bucketing matches the agenda's day view: all-day occurrences are floating
     * dates anchored to UTC midnight, so they belong to their UTC dates; timed
     * ones to every local day they overlap.
     *
     * @param occurrences expanded over (at least) [dayWindow].
     * @param members the workspace's members, oldest first.
     */
    fun build(day: LocalDate, zone: TimeZone, occurrences: List<Occurrence>, members: List<Member>): TodayAgenda {
        val window = dayWindow(day, zone)
        val tones = members.take(2).mapIndexed { index, member ->
            val slot = if (index == 0) MemberTone.Slot.MemberA else MemberTone.Slot.MemberB
            member.id to MemberTone(slot, member.color)
        }.toMap()

        val rows = occurrences
            .filter { it.kind == EventKind.Event }
            .mapNotNull { occurrence -> timeOf(occurrence, day, window, zone)?.let { occurrence to it } }
            .sortedWith(
                compareBy<Pair<Occurrence, RowTime>> { (_, time) -> time != RowTime.AllDay }
                    .thenBy { (occurrence, _) -> occurrence.start }
                    .thenBy { (occurrence, _) -> occurrence.title }
                    .thenBy { (occurrence, _) -> occurrence.key },
            )
            .map { (occurrence, time) ->
                AgendaRow(
                    key = occurrence.key,
                    title = occurrence.title,
                    time = time,
                    tone = if (occurrence.isShared) MemberTone.Shared else tones[occurrence.ownerId] ?: MemberTone.Neutral,
                    cancelled = occurrence.status == EventStatus.Cancelled,
                    inactive = occurrence.inactive,
                )
            }
        return TodayAgenda(day, rows)
    }

    /** The row's label, or null when [occurrence] doesn't fall on [day]. */
    private fun timeOf(occurrence: Occurrence, day: LocalDate, window: TimeWindow, zone: TimeZone): RowTime? {
        if (occurrence.allDay) return if (coversUtcDate(occurrence, day)) RowTime.AllDay else null
        // Half-open overlap; a zero-length event still shows on the day of its start.
        val overlaps = if (occurrence.end > occurrence.start) {
            window.intersects(occurrence.start, occurrence.end)
        } else {
            occurrence.start >= window.start && occurrence.start < window.end
        }
        val startsBefore = occurrence.start < window.start
        return when {
            !overlaps -> null
            startsBefore && occurrence.end >= window.end -> RowTime.AllDay
            startsBefore -> RowTime.Until(localTime(occurrence.end, zone))
            else -> RowTime.Starts(localTime(occurrence.start, zone))
        }
    }

    /** `[start, end)` read as UTC dates; a zero-length all-day occurrence still covers its day. */
    private fun coversUtcDate(occurrence: Occurrence, day: LocalDate): Boolean {
        val first = occurrence.start.toLocalDateTime(TimeZone.UTC).date
        val lastInstant = if (occurrence.end > occurrence.start) occurrence.end - 1.milliseconds else occurrence.start
        return day in first..lastInstant.toLocalDateTime(TimeZone.UTC).date
    }

    private fun localTime(instant: Instant, zone: TimeZone): LocalTime = instant.toLocalDateTime(zone).time
}
