package page.planr.android.feature.agenda

import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
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
import page.planr.android.core.recurrence.DefaultRecurrenceExpander
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput
import page.planr.android.feature.agenda.data.AgendaDataSource

/**
 * In-memory [AgendaDataSource]: events live in a flow and are expanded with
 * the real recurrence engine; every write is recorded for assertions, and
 * [failNext] makes the next write throw.
 */
class FakeAgendaDataSource(
    var session: SessionInfo? = SessionInfo(userId = "user-a", memberId = Fixtures.ANNA, workspaceId = Fixtures.WORKSPACE),
) : AgendaDataSource {
    val members = MutableStateFlow(listOf(Fixtures.anna, Fixtures.boris))
    val categories = MutableStateFlow(listOf(Fixtures.work, Fixtures.home))
    val events = MutableStateFlow<List<PlannerEvent>>(emptyList())
    val overrides = MutableStateFlow<List<EventOverride>>(emptyList())

    val observedWindows = mutableListOf<TimeWindow>()
    val refreshedWindows = mutableListOf<TimeWindow>()
    var workspaceRefreshes = 0
    val calls = mutableListOf<Call>()

    /** Thrown by the next write (and by refreshes while set). */
    var failNext: Exception? = null
    var failRefresh: Exception? = null

    sealed interface Call {
        data class Create(val draft: PlannerEventDraft) : Call
        data class Update(val id: String, val patch: EventPatch, val expectedUpdatedAt: Instant?) : Call
        data class Delete(val id: String) : Call
        data class Restore(val snapshot: DeletedEventSnapshot) : Call
        data class Override(val input: OverrideInput) : Call
        data class Revert(val eventId: String, val occurrenceDate: Instant, val prior: OverridePrior) : Call
        data class Split(val event: PlannerEvent, val from: Instant, val patch: OccurrencePatch) : Call
        data class CapFuture(val event: PlannerEvent, val from: Instant) : Call
    }

    override fun currentSession(): SessionInfo? = session

    override fun observeMembers(): Flow<List<Member>> = members

    override fun observeCategories(): Flow<List<Category>> = categories

    override fun observeOccurrences(window: TimeWindow, zone: TimeZone): Flow<List<Occurrence>> {
        observedWindows += window
        return combine(events, overrides, categories) { evs, ovs, cats ->
            DefaultRecurrenceExpander.expand(evs, ovs, window, zone, cats.filter { it.isShared }.map { it.id }.toSet())
        }
    }

    override suspend fun refreshWorkspace() {
        workspaceRefreshes++
        failRefresh?.let { throw it }
    }

    override suspend fun refreshWindow(window: TimeWindow) {
        refreshedWindows += window
        failRefresh?.let { throw it }
    }

    override fun observeEvent(id: String): Flow<PlannerEvent?> = events.map { list -> list.firstOrNull { it.id == id } }

    override fun observeOverrides(eventId: String): Flow<List<EventOverride>> =
        overrides.map { list -> list.filter { it.eventId == eventId } }

    override suspend fun getEvent(id: String): PlannerEvent? = events.value.firstOrNull { it.id == id }

    override suspend fun createEvent(draft: PlannerEventDraft): PlannerEvent {
        record(Call.Create(draft))
        return Fixtures.event(id = "created-${calls.size}", title = draft.title)
    }

    override suspend fun updateEvent(id: String, patch: EventPatch, expectedUpdatedAt: Instant?): PlannerEvent {
        record(Call.Update(id, patch, expectedUpdatedAt))
        return events.value.first { it.id == id }
    }

    override suspend fun deleteEvent(id: String): DeletedEventSnapshot {
        record(Call.Delete(id))
        events.value = events.value.filterNot { it.id == id }
        return DeletedEventSnapshot(emptyList(), emptyList())
    }

    override suspend fun restoreEvent(snapshot: DeletedEventSnapshot) = record(Call.Restore(snapshot))

    override suspend fun applyOverride(input: OverrideInput): OverridePrior {
        record(Call.Override(input))
        return OverridePrior(null)
    }

    override suspend fun revertOverride(eventId: String, occurrenceDate: Instant, prior: OverridePrior) =
        record(Call.Revert(eventId, occurrenceDate, prior))

    override suspend fun splitSeries(event: PlannerEvent, fromOccurrence: Instant, patch: OccurrencePatch): PlannerEvent {
        record(Call.Split(event, fromOccurrence, patch))
        return event.copy(id = "split-${calls.size}")
    }

    override suspend fun deleteThisAndFuture(event: PlannerEvent, fromOccurrence: Instant): PlannerEvent {
        record(Call.CapFuture(event, fromOccurrence))
        return event
    }

    private fun record(call: Call) {
        failNext?.let {
            failNext = null
            throw it
        }
        calls += call
    }
}
