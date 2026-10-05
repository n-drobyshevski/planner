package page.planr.android.feature.agenda.data

import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.auth.SessionInfo
import page.planr.android.core.data.model.DeletedEventSnapshot
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.model.OverridePrior
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput

/**
 * Everything the agenda feature reads and writes, as one seam over the
 * :core:data repositories so the ViewModels can be unit-tested with a fake.
 * The production binding is [RepositoryAgendaDataSource].
 */
interface AgendaDataSource {
    /** The signed-in member and workspace, or null when signed out. */
    fun currentSession(): SessionInfo?

    /** Both members, oldest first (Member A, then Member B). */
    fun observeMembers(): Flow<List<Member>>

    fun observeCategories(): Flow<List<Category>>

    /** Expanded occurrences overlapping [window]; collecting marks it as on screen. */
    fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>>

    /** Whether the partner's personal events show (device-local, default on). */
    fun observeShowPartnerEvents(): Flow<Boolean>

    suspend fun setShowPartnerEvents(show: Boolean)

    /** Refetches members and categories. */
    suspend fun refreshWorkspace()

    /** Refetches the events and overrides of [window]. */
    suspend fun refreshWindow(window: TimeWindow)

    fun observeEvent(id: String): Flow<PlannerEvent?>

    fun observeOverrides(eventId: String): Flow<List<EventOverride>>

    suspend fun getEvent(id: String): PlannerEvent?

    suspend fun createEvent(draft: PlannerEventDraft): PlannerEvent

    /** Throws `StaleWriteException` when [expectedUpdatedAt] no longer matches. */
    suspend fun updateEvent(id: String, patch: EventPatch, expectedUpdatedAt: Instant? = null): PlannerEvent

    suspend fun deleteEvent(id: String): DeletedEventSnapshot

    suspend fun restoreEvent(snapshot: DeletedEventSnapshot)

    /** "This event": a cancel / modify override. */
    suspend fun applyOverride(input: OverrideInput): OverridePrior

    suspend fun revertOverride(eventId: String, occurrenceDate: Instant, prior: OverridePrior)

    /** "This and following": returns the new series. */
    suspend fun splitSeries(event: PlannerEvent, fromOccurrence: Instant, patch: OccurrencePatch): PlannerEvent

    /** "Delete this and following": caps the series before [fromOccurrence]. */
    suspend fun deleteThisAndFuture(event: PlannerEvent, fromOccurrence: Instant): PlannerEvent

    /**
     * The signed-in member's events an .ics import could duplicate: those with
     * one of [uids] as `attributes.icalUid`, plus theirs that may intersect
     * [window] (series as master rows). Read from the server.
     */
    suspend fun findImportCandidates(uids: Collection<String>, window: TimeWindow?): List<PlannerEvent>

    /** Creates many events at once, all or nothing; the stored rows in [drafts] order. */
    suspend fun createEvents(drafts: List<PlannerEventDraft>): List<PlannerEvent>

    /** Inserts cancel overrides on new series (an import's EXDATEs). */
    suspend fun cancelOccurrences(inputs: List<OverrideInput>)

    /** Deletes many events and their overrides (the undo of [createEvents]). */
    suspend fun deleteEvents(ids: List<String>)
}
