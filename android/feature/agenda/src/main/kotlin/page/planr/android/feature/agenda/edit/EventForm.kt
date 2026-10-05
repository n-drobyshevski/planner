package page.planr.android.feature.agenda.edit

import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.atTime
import kotlinx.datetime.daysUntil
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.recurrence.RRuleBuild
import page.planr.android.core.recurrence.RecurrenceForm

/** The editor's sharing control (`visibility` in the web's event form). */
enum class VisibilityChoice {
    /** Only the owner sees it (`is_private`). */
    Private,

    /** The partner sees it on the owner's calendar, read-only (the default). */
    Visible,

    /** Joint: on both calendars, both can edit (`is_shared`). */
    Shared,
}

/** Why the form can't be saved yet (`createEventFormSchema`). */
enum class EventFormError { TitleRequired, EndBeforeStart }

/**
 * The editor's field values — the web's `EventFormValues`. Timed events are
 * interpreted in [timeZone]; all-day events are floating dates anchored to
 * UTC midnight, with [endDate] inclusive (`computeEventTimes`).
 */
data class EventForm(
    val title: String = "",
    val allDay: Boolean = false,
    val startDate: LocalDate,
    val startTime: LocalTime,
    val endDate: LocalDate,
    val endTime: LocalTime,
    val timeZone: String,
    val categoryId: String? = null,
    val visibility: VisibilityChoice = VisibilityChoice.Visible,
    val recurrence: RecurrenceForm? = null,
    val location: String = "",
    val description: String = "",
    // Carried through unchanged; v1 has no control for them.
    val inactive: Boolean = false,
    val status: EventStatus = EventStatus.Confirmed,
    val hiddenFromPublic: Boolean = false,
) {
    val zone: TimeZone get() = TimeZone.of(timeZone)

    val start: Instant
        get() = if (allDay) startDate.atStartOfDayIn(TimeZone.UTC) else startDate.atTime(startTime).toInstant(zone)

    val end: Instant
        get() = if (allDay) endDate.plus(1, DateTimeUnit.DAY).atStartOfDayIn(TimeZone.UTC) else endDate.atTime(endTime).toInstant(zone)

    fun validate(): EventFormError? = when {
        title.isBlank() -> EventFormError.TitleRequired
        end <= start -> EventFormError.EndBeforeStart
        else -> null
    }

    /** Moves the start, keeping the duration (the end follows) when the form was valid. */
    fun withStart(date: LocalDate = startDate, time: LocalTime = startTime): EventForm {
        if (allDay) {
            val span = startDate.daysUntil(endDate).coerceAtLeast(0)
            return copy(startDate = date, endDate = date.plus(span, DateTimeUnit.DAY))
        }
        val duration = (end - start).takeIf { it > Duration.ZERO } ?: DEFAULT_DURATION
        val moved = copy(startDate = date, startTime = time)
        val newEnd = (moved.start + duration).toLocalDateTime(zone)
        return moved.copy(endDate = newEnd.date, endTime = newEnd.time)
    }

    /** Switches to another zone, keeping the wall-clock times (a different instant). */
    fun withTimeZone(id: String): EventForm = copy(timeZone = id)

    companion object {
        val DEFAULT_DURATION = 60.minutes

        /** A new event at [start] for an hour (`buildInitial`, create mode). */
        fun blank(start: Instant, zone: TimeZone): EventForm {
            val s = start.toLocalDateTime(zone)
            val e = (start + DEFAULT_DURATION).toLocalDateTime(zone)
            return EventForm(
                startDate = s.date,
                startTime = s.time,
                endDate = e.date,
                endTime = e.time,
                timeZone = zone.id,
            )
        }

        /**
         * The form for editing [occurrence] of [event] (`buildInitial`, edit
         * mode): times from the occurrence, series-level fields from the master.
         */
        fun of(event: PlannerEvent, occurrence: Occurrence, zone: TimeZone): EventForm {
            val dateZone = if (occurrence.allDay) TimeZone.UTC else zone
            val startDate = occurrence.start.toLocalDateTime(dateZone).date
            val endDate = if (occurrence.allDay) {
                (occurrence.end.toLocalDateTime(TimeZone.UTC).date).minus(1, DateTimeUnit.DAY).let { maxOf(it, startDate) }
            } else {
                occurrence.end.toLocalDateTime(zone).date
            }
            val startTime = if (occurrence.allDay) ALL_DAY_START else occurrence.start.toLocalDateTime(zone).time
            val endTime = if (occurrence.allDay) ALL_DAY_END else occurrence.end.toLocalDateTime(zone).time
            return EventForm(
                title = occurrence.title,
                allDay = occurrence.allDay,
                startDate = startDate,
                startTime = startTime,
                endDate = endDate,
                endTime = endTime,
                timeZone = zone.id,
                categoryId = occurrence.categoryId,
                visibility = when {
                    event.isPrivate -> VisibilityChoice.Private
                    event.isShared -> VisibilityChoice.Shared
                    else -> VisibilityChoice.Visible
                },
                recurrence = RRuleBuild.parseRRule(event.rrule),
                location = occurrence.location.orEmpty(),
                description = occurrence.description.orEmpty(),
                inactive = occurrence.inactive,
                status = event.status,
                hiddenFromPublic = event.hiddenFromPublic,
            )
        }

        /** Times offered when an all-day event is switched to a timed one. */
        private val ALL_DAY_START = LocalTime(9, 0)
        private val ALL_DAY_END = LocalTime(10, 0)
    }
}
