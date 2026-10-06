package page.planr.android.feature.agenda

import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import page.planr.android.feature.agenda.model.AgendaMode
import page.planr.android.feature.agenda.model.AgendaPeriods
import page.planr.android.feature.agenda.model.DaySchedule

/**
 * What the agenda draws. [schedules] covers the focused period and one period
 * on each side, so a swipe reveals a neighbour that is already filled in.
 */
data class AgendaUiState(
    val mode: AgendaMode,
    val today: LocalDate,
    /** The date in focus; its period is the one on screen. */
    val focusDate: LocalDate,
    val zone: TimeZone,
    /** Minute-ticking clock for the current-time line. */
    val now: Instant,
    val schedules: Map<LocalDate, DaySchedule> = emptyMap(),
    /** False until the first read from the local cache lands. */
    val isLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    /** Signed in, so "New event" can create something. */
    val canCreate: Boolean = false,
    /** The other member, for the header's show/hide toggle; null in a one-person workspace. */
    val partner: PartnerToggle? = null,
    /** The filter sheet's own calendar and contexts (the partner is [partner]). */
    val filters: CalendarFilters = CalendarFilters(),
) {
    /** The focused period, counted in periods from today's. */
    val periodOffset: Int get() = AgendaPeriods.offsetOf(mode, today, focusDate)

    /** The first day of the period [offset] periods from today's (for Month, the 1st). */
    fun periodStartAt(offset: Int): LocalDate = AgendaPeriods.shiftedStart(mode, today, offset)

    /** The days of the period [offset] periods from today's (for Month, its six weeks). */
    fun daysAt(offset: Int): List<LocalDate> = AgendaPeriods.days(mode, periodStartAt(offset))

    /** The focused period's days. */
    val days: List<LocalDate> get() = daysAt(periodOffset)

    fun schedule(date: LocalDate): DaySchedule = schedules[date] ?: DaySchedule.empty(date)
}

/**
 * The header's partner toggle: whether the partner's personal events show
 * (joint ones always do). [color] is their `members.color`; without one the
 * member-slot default applies ([isMemberA]: the older member).
 */
data class PartnerToggle(
    val name: String,
    val color: String?,
    val isMemberA: Boolean,
    val shown: Boolean,
)

/**
 * The calendar filter sheet (the web's calendar sidebar, as its phone sheet
 * shows it): the viewer's own calendar, the partner's ([AgendaUiState.partner])
 * and every context, each shown or hidden.
 */
data class CalendarFilters(
    /** The viewer's own calendar; null until their member row is known. */
    val own: CalendarLayer? = null,
    val contexts: List<ContextFilter> = emptyList(),
    /**
     * The own calendar or a context is hidden: the filter button carries a
     * dot. The partner has its own toggle in the header, so it doesn't count.
     */
    val narrowed: Boolean = false,
)

/** A member's calendar in the filter sheet, in their colour ([isMemberA] picks the slot default). */
data class CalendarLayer(
    val name: String,
    val color: String?,
    val isMemberA: Boolean,
    val shown: Boolean,
)

/** One context (category) in the filter sheet; [shared] ones are joint. */
data class ContextFilter(
    val id: String,
    val name: String,
    val color: String,
    val shared: Boolean,
    val shown: Boolean,
)
