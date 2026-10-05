package page.planr.android.feature.agenda.data

import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.auth.SessionInfo
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.model.DeletedEventSnapshot
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.model.OverridePrior
import page.planr.android.core.data.prefs.ViewPreferences
import page.planr.android.core.data.repository.EventRepository
import page.planr.android.core.data.repository.OccurrenceRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput

/** [AgendaDataSource] backed by the Room-first :core:data repositories. */
class RepositoryAgendaDataSource @Inject constructor(
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val events: EventRepository,
    private val occurrences: OccurrenceRepository,
    private val viewPreferences: ViewPreferences,
) : AgendaDataSource {

    override fun currentSession(): SessionInfo? = session.currentSession

    override fun observeMembers(): Flow<List<Member>> = workspace.observeMembers()

    override fun observeCategories(): Flow<List<Category>> = workspace.observeCategories()

    override fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>> =
        occurrences.observeOccurrences(window, zone)

    override fun observeShowPartnerEvents(): Flow<Boolean> = viewPreferences.showPartnerEvents

    override suspend fun setShowPartnerEvents(show: Boolean) = viewPreferences.setShowPartnerEvents(show)

    override suspend fun refreshWorkspace() = workspace.refresh()

    override suspend fun refreshWindow(window: TimeWindow) = occurrences.refresh(window)

    override fun observeEvent(id: String): Flow<PlannerEvent?> = events.observeEvent(id)

    override fun observeOverrides(eventId: String): Flow<List<EventOverride>> = events.observeOverrides(eventId)

    override suspend fun getEvent(id: String): PlannerEvent? = events.getEvent(id)

    override suspend fun createEvent(draft: PlannerEventDraft): PlannerEvent = events.createEvent(draft)

    override suspend fun updateEvent(id: String, patch: EventPatch, expectedUpdatedAt: Instant?): PlannerEvent =
        events.updateEvent(id, patch, expectedUpdatedAt)

    override suspend fun deleteEvent(id: String): DeletedEventSnapshot = events.deleteEvent(id)

    override suspend fun restoreEvent(snapshot: DeletedEventSnapshot) = events.restoreEvent(snapshot)

    override suspend fun applyOverride(input: OverrideInput): OverridePrior = events.applyOverride(input)

    override suspend fun revertOverride(eventId: String, occurrenceDate: Instant, prior: OverridePrior) =
        events.revertOverride(eventId, occurrenceDate, prior)

    override suspend fun splitSeries(event: PlannerEvent, fromOccurrence: Instant, patch: OccurrencePatch): PlannerEvent =
        events.splitSeries(event, fromOccurrence, patch)

    override suspend fun deleteThisAndFuture(event: PlannerEvent, fromOccurrence: Instant): PlannerEvent =
        events.deleteThisAndFuture(event, fromOccurrence)

    override suspend fun findImportCandidates(uids: Collection<String>, window: TimeWindow?): List<PlannerEvent> =
        events.findImportCandidates(uids, window)

    override suspend fun createEvents(drafts: List<PlannerEventDraft>): List<PlannerEvent> = events.createEvents(drafts)

    override suspend fun cancelOccurrences(inputs: List<OverrideInput>) = events.cancelOccurrences(inputs)

    override suspend fun deleteEvents(ids: List<String>) = events.deleteEvents(ids)
}
