package page.planr.android.core.data.health

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.R
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.repository.EventRepository
import page.planr.android.core.data.repository.OccurrenceRepository
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.OccurrencePatch

/** The calendar side of snapping sleep blocks, behind an interface so sync is testable. */
interface SleepBlockCalendar {
    /** The member's occurrences overlapping [window], fresh from the server. */
    suspend fun occurrences(window: TimeWindow, zoneId: String): List<Occurrence>

    suspend fun create(workspaceId: String, ownerId: String, start: Instant, end: Instant, zoneId: String, sleepCategoryId: String?)

    suspend fun move(eventId: String, start: Instant, end: Instant)

    suspend fun moveOccurrence(eventId: String, occurrenceDate: Instant, start: Instant, end: Instant)
}

/** Through the repositories, so Room (the agenda, the widgets) sees each change at once. */
class RepositorySleepBlockCalendar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val occurrences: OccurrenceRepository,
    private val events: EventRepository,
) : SleepBlockCalendar {
    override suspend fun occurrences(window: TimeWindow, zoneId: String): List<Occurrence> {
        // Forced: what this returns decides whether a block is created or moved.
        occurrences.refresh(window, force = true)
        return occurrences.snapshot(window, TimeZone.of(zoneId))
    }

    override suspend fun create(
        workspaceId: String,
        ownerId: String,
        start: Instant,
        end: Instant,
        zoneId: String,
        sleepCategoryId: String?,
    ) {
        events.createEvent(
            PlannerEventDraft(
                workspaceId = workspaceId,
                ownerId = ownerId,
                title = context.getString(R.string.sleep_block_title),
                start = start,
                end = end,
                timeZone = zoneId,
                // As the web does: file it in the sleep category, or mark it
                // inactive so the inactive≡sleep rule reads it as a night.
                categoryId = sleepCategoryId,
                inactive = sleepCategoryId == null,
                status = EventStatus.Confirmed,
            ),
        )
    }

    override suspend fun move(eventId: String, start: Instant, end: Instant) {
        events.updateEvent(eventId, EventPatch(start = PatchField.Value(start), end = PatchField.Value(end)))
    }

    override suspend fun moveOccurrence(eventId: String, occurrenceDate: Instant, start: Instant, end: Instant) {
        events.modifyOccurrence(eventId, occurrenceDate, OccurrencePatch(start = start, end = end))
    }
}
