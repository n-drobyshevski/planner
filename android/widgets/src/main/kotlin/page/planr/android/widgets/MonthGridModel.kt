package page.planr.android.widgets

import java.time.temporal.IsoFields
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaLocalDate
import page.planr.android.core.model.CalendarWeeks
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/**
 * The shown month as the Month widget draws it: whole Monday-first weeks,
 * each with its ISO week number ([weekNumbers], one per row of [weeks]).
 */
internal data class MonthGrid(
    val month: LocalDate,
    val today: LocalDate,
    val weeks: List<List<MonthDay>>,
    val weekNumbers: List<Int>,
)

/** One cell: its events as titled chips, in the Today widget's order (all-day first, then by start). */
internal data class MonthDay(
    val date: LocalDate,
    val inMonth: Boolean,
    val chips: List<MonthChip>,
) {
    val eventCount: Int get() = chips.size
}

/**
 * One event in a cell. [colorHex] is the block colour the agenda paints it
 * with (the item's own, else its context's, else its owner's); [tone] is the
 * member-slot fallback when none of those parse.
 */
internal data class MonthChip(
    val key: String,
    val title: String,
    val colorHex: String?,
    val tone: MemberTone,
)

/**
 * A day's events as chips, for the Month and Week grid widgets: bucketed and
 * ordered as the Today widget does, cancelled ones left out (inactive ones
 * stay, as the Today widget lists them), coloured as the agenda paints them.
 */
internal class CalendarDays(
    private val zone: TimeZone,
    private val occurrences: List<Occurrence>,
    private val members: List<Member>,
    categories: List<Category>,
) {
    private val byKey = occurrences.associateBy { it.key }
    private val memberColors = members.associate { it.id to it.color }
    private val categoryColors = categories.associate { it.id to it.color }

    fun chipsFor(day: LocalDate): List<MonthChip> =
        TodayAgendaModel.build(day, zone, occurrences, members).rows
            .filterNot { it.cancelled }
            .map { row ->
                val occurrence = byKey[row.key]
                MonthChip(
                    key = row.key,
                    title = row.title,
                    colorHex = occurrence?.let {
                        it.color ?: it.categoryId?.let(categoryColors::get) ?: memberColors[it.ownerId]
                    },
                    tone = row.tone,
                )
            }
}

/** Builds [MonthGrid] from expanded occurrences. Pure, so it is unit-tested directly. */
internal object MonthGridModel {

    /** The grid of [month]'s month, local midnight of its first Monday to the midnight after its last Sunday. */
    fun gridWindow(month: LocalDate, zone: TimeZone): TimeWindow {
        val weeks = CalendarWeeks.monthGrid(month)
        return TodayAgendaModel.daysWindow(weeks.first().first(), weeks.last().last(), zone)
    }

    /**
     * Every day of [month]'s grid with its events ([CalendarDays]).
     *
     * @param month any day of the month to show.
     * @param occurrences expanded over (at least) [gridWindow].
     * @param members the workspace's members, oldest first.
     */
    fun build(
        month: LocalDate,
        today: LocalDate,
        zone: TimeZone,
        occurrences: List<Occurrence>,
        members: List<Member>,
        categories: List<Category> = emptyList(),
    ): MonthGrid {
        val first = CalendarWeeks.monthStart(month)
        val days = CalendarDays(zone, occurrences, members, categories)
        val grid = CalendarWeeks.monthGrid(month)
        val weeks = grid.map { week ->
            week.map { day ->
                MonthDay(
                    date = day,
                    inMonth = day.month == first.month && day.year == first.year,
                    chips = days.chipsFor(day),
                )
            }
        }
        return MonthGrid(first, today, weeks, grid.map { isoWeek(it.first()) })
    }

    /** ISO-8601 week number of [monday]'s week (weeks start Monday; week 1 holds the first Thursday). */
    fun isoWeek(monday: LocalDate): Int = monday.toJavaLocalDate().get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)

    /**
     * How a cell with room for [slots] chips shows [eventCount] events: the
     * chips to draw and the "+N" left over. When they don't all fit, the last
     * slot goes to "+N", so a cell never pretends to be complete.
     */
    fun chipLayout(slots: Int, eventCount: Int): Pair<Int, Int> = when {
        slots <= 0 -> 0 to 0
        eventCount <= slots -> eventCount to 0
        else -> (slots - 1) to (eventCount - (slots - 1))
    }
}
