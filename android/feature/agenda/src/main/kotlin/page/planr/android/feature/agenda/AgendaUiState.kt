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
) {
    /** The focused period, counted in periods from today's. */
    val periodOffset: Int get() = AgendaPeriods.offsetOf(mode, today, focusDate)

    /** The days of the period [offset] periods from today's. */
    fun daysAt(offset: Int): List<LocalDate> =
        AgendaPeriods.days(mode, AgendaPeriods.shiftedStart(mode, today, offset))

    /** The focused period's days. */
    val days: List<LocalDate> get() = daysAt(periodOffset)

    fun schedule(date: LocalDate): DaySchedule = schedules[date] ?: DaySchedule.empty(date)
}
