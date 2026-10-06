package page.planr.android.feature.quickadd.model

import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import page.planr.android.feature.quickadd.QuickAddKind

/**
 * The Quick add fields: a title plus the minimum to place it. A task gets an
 * optional due date; an event gets a day, and either "all day" or a start and
 * end time. An end at or before the start on the clock means the next day, so
 * an evening event can run past midnight without a second date field. Notes
 * are optional (the task's or event's description), filled mostly by text
 * shared from another app.
 */
data class QuickAddForm(
    val kind: QuickAddKind,
    val title: String = "",
    val notes: String = "",
    val dueDate: LocalDate? = null,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val allDay: Boolean = false,
) {
    val isTitleValid: Boolean get() = title.isNotBlank()

    /** The notes to save as the description; null when there are none. */
    val description: String? get() = notes.trim().ifEmpty { null }

    /** A timed event whose end time is on the following day. */
    val endsNextDay: Boolean get() = !allDay && endTime < startTime

    /** Moves the start and keeps the duration, as calendar editors do. */
    fun withStartTime(time: LocalTime): QuickAddForm {
        val duration = minutesBetween(startTime, endTime)
        return copy(startTime = time, endTime = time.plusMinutes(duration))
    }

    /**
     * The event's instants, as the web's `computeEventTimes`: an all-day event
     * is anchored to UTC midnight and ends at the next UTC midnight; a timed one
     * is wall-clock time in the viewer's zone (DST-correct).
     */
    fun eventTimes(zone: TimeZone): Pair<Instant, Instant> {
        if (allDay) {
            val start = date.atStartOfDayIn(TimeZone.UTC)
            return start to date.plus(ONE_DAY).atStartOfDayIn(TimeZone.UTC)
        }
        val endDate = if (endsNextDay) date.plus(ONE_DAY) else date
        return LocalDateTime(date, startTime).toInstant(zone) to LocalDateTime(endDate, endTime).toInstant(zone)
    }

    /** Null when the form can be saved, else the first problem. */
    fun validate(): QuickAddError? = when {
        !isTitleValid -> QuickAddError.TitleRequired
        kind == QuickAddKind.Event && !allDay && startTime == endTime -> QuickAddError.EndBeforeStart
        else -> null
    }

    companion object {
        private val ONE_DAY = DatePeriod(days = 1)
        private const val STEP_MINUTES = 30
        private const val DEFAULT_LENGTH_MINUTES = 60

        /**
         * A fresh form, as the web's new-event defaults: start at the next
         * half hour in [zone], one hour long; no due date for a task.
         */
        fun initial(kind: QuickAddKind, now: Instant, zone: TimeZone): QuickAddForm {
            val start = ceilToStep(now, STEP_MINUTES).toLocalDateTime(zone)
            return QuickAddForm(
                kind = kind,
                date = start.date,
                startTime = start.time,
                endTime = start.time.plusMinutes(DEFAULT_LENGTH_MINUTES),
            )
        }

        /** `ceilToStep(Date.now(), 30)`: the next step boundary (now itself when already on one). */
        internal fun ceilToStep(now: Instant, stepMinutes: Int): Instant {
            val step = stepMinutes.minutes.inWholeMilliseconds
            val ms = now.toEpochMilliseconds()
            val ceiled = (ms + step - 1).floorDiv(step) * step
            return Instant.fromEpochMilliseconds(ceiled)
        }
    }
}

enum class QuickAddError { TitleRequired, EndBeforeStart, NotSignedIn, Failed }

private const val MINUTES_PER_DAY = 24 * 60

private fun LocalTime.minuteOfDay(): Int = hour * 60 + minute

/** Wall-clock minutes from [from] to [to], wrapping past midnight. */
private fun minutesBetween(from: LocalTime, to: LocalTime): Int =
    (to.minuteOfDay() - from.minuteOfDay()).mod(MINUTES_PER_DAY)

private fun LocalTime.plusMinutes(minutes: Int): LocalTime {
    val total = (minuteOfDay() + minutes).mod(MINUTES_PER_DAY)
    return LocalTime(total / 60, total % 60)
}
