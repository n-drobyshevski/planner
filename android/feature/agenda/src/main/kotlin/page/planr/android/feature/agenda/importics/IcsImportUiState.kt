package page.planr.android.feature.agenda.importics

import kotlin.time.Instant
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.ical.ExistingEvent
import page.planr.android.core.ical.IcsEvent
import page.planr.android.core.ical.IcsWarning
import page.planr.android.core.model.Category
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.feature.agenda.edit.EventForm
import page.planr.android.feature.agenda.edit.EventFormError
import page.planr.android.feature.agenda.edit.EventWrites
import page.planr.android.feature.agenda.edit.VisibilityChoice

/**
 * One event of the file under review. [initial] is the form as read from the
 * file; [form] carries the user's edits (title, all-day, start / end).
 */
data class ImportRow(
    val event: IcsEvent,
    /** Already in Planr (same UID, or same title and times). */
    val duplicate: Boolean,
    val selected: Boolean,
    val initial: EventForm,
    val form: EventForm,
) {
    val key: String get() = event.key

    val edited: Boolean get() = form != initial

    /** An edit that can't be imported: the end before the start. */
    val error: EventFormError? get() = if (timesEdited && form.end < form.start) EventFormError.EndBeforeStart else null

    val repeatsUnsupported: Boolean get() = IcsWarning.RRuleUnsupported in event.warnings

    /** The times were edited (all-day, dates, times or zone), not just the title. */
    val timesEdited: Boolean get() = form.copy(title = initial.title) != initial

    /** The event as it would be imported, edits applied (untouched times stay the file's exact instants). */
    val current: IcsEvent
        get() = when {
            !edited -> event
            !timesEdited -> event.copy(title = form.title.trim())
            else -> {
                val start = form.start.toEpochMilliseconds()
                event.copy(
                    title = form.title.trim(),
                    allDay = form.allDay,
                    start = start,
                    end = form.end.toEpochMilliseconds(),
                    timeZone = form.timeZone,
                    exdates = shiftedExdates(start),
                )
            }
        }

    /**
     * The occurrences to cancel on the imported series: the file's, moved
     * along with an edited start (dropped when all-day was switched, since
     * the occurrence instants change kind).
     */
    fun exdates(): List<Long> = current.exdates

    private fun shiftedExdates(start: Long): List<Long> = when {
        form.allDay != event.allDay -> emptyList()
        else -> event.exdates.map { it + (start - event.start) }
    }

    /**
     * The insert payload, filed under [categoryId] with [visibility] (the
     * review's bulk choices; a shared context makes it joint). The rule, its
     * UNTIL and the UID (`attributes.icalUid`) come from the file; unedited
     * times are the file's exact instants.
     */
    fun draft(
        workspaceId: String,
        ownerId: String,
        categoryId: String?,
        visibility: VisibilityChoice,
        categories: List<Category>,
    ): PlannerEventDraft {
        val chosen = form.copy(categoryId = categoryId, visibility = visibility)
        val base = EventWrites.draft(chosen, workspaceId, ownerId, categories)
        val e = current
        return base.copy(
            title = e.title.trim(),
            allDay = e.allDay,
            start = Instant.fromEpochMilliseconds(e.start),
            end = Instant.fromEpochMilliseconds(e.end),
            timeZone = e.timeZone,
            rrule = e.rrule,
            recurrenceEndsAt = e.recurrenceEndsAt?.let(Instant::fromEpochMilliseconds),
            attributes = e.uid?.let { uid -> buildJsonObject { put(ICAL_UID, uid) } } ?: JsonObject(emptyMap()),
        )
    }

    companion object {
        /** The `attributes` key an imported event keeps its UID under. */
        const val ICAL_UID = "icalUid"

        private val ALL_DAY_START = LocalTime(9, 0)
        private val ALL_DAY_END = LocalTime(10, 0)

        /** The editor form for [event]: all-day dates inclusive, timed ones in the event's own zone. */
        fun formOf(event: IcsEvent): EventForm {
            val start = Instant.fromEpochMilliseconds(event.start)
            val end = Instant.fromEpochMilliseconds(event.end)
            val base = if (event.allDay) {
                val startDate = start.toLocalDateTime(TimeZone.UTC).date
                EventForm(
                    allDay = true,
                    startDate = startDate,
                    startTime = ALL_DAY_START,
                    endDate = maxOf(end.toLocalDateTime(TimeZone.UTC).date.minus(1, DateTimeUnit.DAY), startDate),
                    endTime = ALL_DAY_END,
                    timeZone = event.timeZone,
                )
            } else {
                val zone = TimeZone.of(event.timeZone)
                val s = start.toLocalDateTime(zone)
                val e = end.toLocalDateTime(zone)
                EventForm(startDate = s.date, startTime = s.time, endDate = e.date, endTime = e.time, timeZone = event.timeZone)
            }
            return base.copy(
                title = event.title,
                location = event.location.orEmpty(),
                description = event.description.orEmpty(),
                status = event.status,
            )
        }

        /** A Planr event as duplicate detection sees it. */
        fun existingOf(event: PlannerEvent): ExistingEvent = ExistingEvent(
            icalUid = (event.attributes[ICAL_UID] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            title = event.title,
            start = event.start.toEpochMilliseconds(),
            end = event.end.toEpochMilliseconds(),
        )
    }
}

/** The import review's screen state. */
data class IcsImportUiState(
    val phase: Phase = Phase.Loading,
    val rows: List<ImportRow> = emptyList(),
    /** The rows the filters keep, in file order (by start). */
    val visible: List<ImportRow> = emptyList(),
    /** VEVENTs that couldn't be read (no usable start). */
    val skipped: Int = 0,
    val nameFilter: String = "",
    /** The name filter is an invalid `/regex/`; it filters nothing until fixed. */
    val nameFilterInvalid: Boolean = false,
    val from: LocalDate? = null,
    val to: LocalDate? = null,
    /** Contexts the viewer may file under: shared ones and their own. */
    val categories: List<Category> = emptyList(),
    val categoryId: String? = null,
    val visibility: VisibilityChoice = VisibilityChoice.Visible,
    /** The row whose inline editor is open. */
    val expandedKey: String? = null,
    /** The duplicate lookup failed (offline): nothing is marked as already in Planr. */
    val duplicatesUnknown: Boolean = false,
    val importing: Boolean = false,
    /** The viewer's zone: what times are shown in and the date range means. */
    val zone: String = "UTC",
) {
    enum class Phase {
        Loading,

        /** No file is waiting (e.g. the app was restarted on this screen). */
        NoFile,

        /** The file holds no readable event. */
        Empty,
        Ready,
    }

    /** What Import writes: the selected rows the filters keep. */
    val toImport: List<ImportRow> get() = visible.filter { it.selected }

    val duplicates: Int get() = rows.count { it.duplicate }

    /** Every kept row is selected (and there is one). */
    val allVisibleSelected: Boolean get() = visible.isNotEmpty() && visible.all { it.selected }

    /** The chosen context is shared, so the events are joint through it (no visibility control). */
    val sharedContext: Boolean
        get() = categoryId?.let { id -> categories.firstOrNull { it.id == id } }?.isShared == true
}

/** One-shot outcomes the review screen reacts to. */
sealed interface IcsImportEffect {
    /** Imported; leave the review (the agenda shows the notice with Undo). */
    data object Done : IcsImportEffect

    /** The import failed and nothing was kept; the review stays as it was. */
    data object Failed : IcsImportEffect
}
