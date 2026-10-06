package page.planr.android.core.data.repository

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.local.CacheArea
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.local.PlanrDatabase
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.model.DeletedEventSnapshot
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.model.OverridePrior
import page.planr.android.core.data.remote.EventMutations
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput
import page.planr.android.core.recurrence.PatchField

/**
 * Events: Room-backed reads plus the v1 writes. Every write goes to Supabase
 * first (v1 has no offline outbox — a failure throws to the caller), then the
 * returned row is applied to Room and the widgets are asked to refresh.
 * Room writes go through [CacheGate], so a write whose request outlives a
 * sign-out is dropped, and a window refresh never reverts a newer change.
 *
 * Recurring edits, by the user's choice in the edit sheet:
 * - "this event": [applyOverride] with `EditSemantics.cancelOccurrence` /
 *   `modifyOccurrence` (or the [cancelOccurrence] / [modifyOccurrence] shorthands)
 * - "this and following": [splitSeries], or [deleteThisAndFuture] to delete
 * - "all events": [updateAll], or [deleteEvent] to delete the series
 */
@Singleton
class EventRepository @Inject constructor(
    private val session: SessionManager,
    private val queries: WorkspaceQueries,
    private val mutations: EventMutations,
    private val db: PlanrDatabase,
    private val gate: CacheGate,
    private val widgets: WidgetRefreshDispatcher,
) {
    private val dao get() = db.eventDao()

    fun observeEvent(id: String): Flow<PlannerEvent?> = dao.observeById(id).map { it?.toModel() }

    fun observeOverrides(eventId: String): Flow<List<EventOverride>> =
        dao.observeOverridesFor(eventId).map { rows -> rows.map { it.toModel() } }

    suspend fun getEvent(id: String): PlannerEvent? = dao.getById(id)?.toModel()

    /**
     * Refetches [window] (`fetchWindow`) and replaces what Room holds for it,
     * so rows deleted elsewhere disappear too.
     *
     * The deletion is exact because `EventDao.IN_WINDOW` is the predicate
     * `fetchWindow` returns (its server filter plus `mayIntersect`; the
     * `is_recurring` column is `rrule != null`): a cached row that matches it
     * but is missing from the response was deleted on the server or moved
     * out of the window, and nothing else is. Every page is fetched inside
     * the `fetch` lambda, before anything is applied, so a fetch that fails
     * partway writes nothing.
     */
    suspend fun refreshWindow(window: TimeWindow) {
        val ws = session.requireSession().workspaceId
        val start = window.start.toEpochMilliseconds()
        val end = window.end.toEpochMilliseconds()
        gate.refresh(CacheArea.Events, fetch = { queries.fetchWindow(ws, window) }) { data ->
            db.withTransaction {
                val stale = dao.idsInWindow(ws, start, end)
                val touched = (stale + data.events.map { it.id }).distinct()
                touched.chunked(SQL_CHUNK).forEach { dao.deleteOverridesOf(it) }
                stale.chunked(SQL_CHUNK).forEach { dao.deleteEvents(it) }
                dao.upsertEvents(data.events.map { it.toEntity() })
                dao.upsertOverrides(data.overrides.map { it.toEntity() })
            }
        }
    }

    suspend fun createEvent(draft: PlannerEventDraft): PlannerEvent =
        write({ mutations.createEvent(draft) }) { storeLocally(it) }

    /**
     * Creates many events at once (an .ics import): one insert per 200
     * drafts, all or nothing, then one Room upsert and one widget refresh.
     * Returns the stored rows in [drafts] order.
     */
    suspend fun createEvents(drafts: List<PlannerEventDraft>): List<PlannerEvent> {
        if (drafts.isEmpty()) return emptyList()
        return write({ mutations.createEvents(drafts) }) { created ->
            dao.upsertEvents(created.map { it.toEntity() })
        }
    }

    /** Cancels many occurrences of new series at once (an import's EXDATEs). */
    suspend fun cancelOccurrences(inputs: List<OverrideInput>) {
        if (inputs.isEmpty()) return
        val ws = session.requireSession().workspaceId
        write({ mutations.insertCancelOverrides(ws, inputs) }) { stored ->
            dao.upsertOverrides(stored.map { it.toEntity() })
        }
    }

    /** Deletes many events and their overrides (the undo of [createEvents]); no snapshot is kept. */
    suspend fun deleteEvents(ids: List<String>) {
        if (ids.isEmpty()) return
        write({ mutations.deleteEvents(ids) }) {
            db.withTransaction {
                ids.chunked(SQL_CHUNK).forEach { chunk ->
                    dao.deleteOverridesOf(chunk)
                    dao.deleteEvents(chunk)
                }
            }
        }
    }

    /**
     * The signed-in member's events an .ics import could duplicate: those
     * carrying one of [uids] as `attributes.icalUid`, plus their events that
     * may intersect [window] (the file's span; the paged `fetchWindow`, so
     * series come as their master rows) for the title + time match. Read
     * from the server, never cached; distinct by id.
     */
    suspend fun findImportCandidates(uids: Collection<String>, window: TimeWindow?): List<PlannerEvent> {
        val s = session.requireSession()
        val byUid = queries.fetchEventsByIcalUid(s.workspaceId, s.memberId, uids)
        val inWindow = window
            ?.let { queries.fetchWindow(s.workspaceId, it, includeOverrides = false).events }
            .orEmpty()
            .filter { it.ownerId == s.memberId }
        return (byUid + inWindow).distinctBy { it.id }
    }

    /**
     * Updates the master row. Pass the [PlannerEvent.updatedAt] the edit was
     * based on as [expectedUpdatedAt] to fail with [StaleWriteException]
     * (after reloading the row) if someone changed it meanwhile.
     */
    suspend fun updateEvent(id: String, patch: EventPatch, expectedUpdatedAt: Instant? = null): PlannerEvent =
        write({ reloadingOnStale(id) { mutations.updateEvent(id, patch, expectedUpdatedAt) } }) { storeLocally(it) }

    /** Deletes an event / whole series; keep the snapshot to [restoreEvent] (undo). */
    suspend fun deleteEvent(id: String): DeletedEventSnapshot =
        write({ mutations.deleteEventDeep(id) }) { deleteLocally(id) }

    suspend fun restoreEvent(snapshot: DeletedEventSnapshot) {
        write({ mutations.restoreDeleted(snapshot) }) { restored ->
            db.withTransaction {
                dao.upsertEvents(restored.events.map { it.toEntity() })
                dao.upsertOverrides(restored.overrides.map { it.toEntity() })
            }
        }
    }

    /** "This event": upsert a cancel/modify override; keep the prior for [revertOverride]. */
    suspend fun applyOverride(input: OverrideInput): OverridePrior {
        val ws = session.requireSession().workspaceId
        val applied = write({ mutations.applyOverride(ws, input) }) { applied ->
            applied.override?.let { dao.upsertOverrides(listOf(it.toEntity())) }
        }
        return applied.prior
    }

    suspend fun cancelOccurrence(eventId: String, occurrenceDate: Instant): OverridePrior =
        applyOverride(EditSemantics.cancelOccurrence(eventId, occurrenceDate))

    suspend fun modifyOccurrence(eventId: String, occurrenceDate: Instant, patch: OccurrencePatch): OverridePrior =
        applyOverride(EditSemantics.modifyOccurrence(eventId, occurrenceDate, patch))

    /** Undo of [applyOverride]. */
    suspend fun revertOverride(eventId: String, occurrenceDate: Instant, prior: OverridePrior) {
        write({ mutations.revertOverride(eventId, occurrenceDate, prior) }) { restored ->
            if (restored != null) {
                dao.upsertOverrides(listOf(restored.toEntity()))
            } else {
                dao.deleteOverrideAt(eventId, occurrenceDate.toEpochMilliseconds())
            }
        }
    }

    /** "All events": patch the series master (duration kept when only start moves). */
    suspend fun updateAll(event: PlannerEvent, patch: OccurrencePatch): PlannerEvent =
        write({ mutations.updateAll(event, patch) }) { storeLocally(it) }

    /**
     * "This and following": start a new series at [fromOccurrence] carrying
     * [patch] and cap [event] before it. Returns the new series. The remote
     * split is all or nothing, and Room only sees it once both writes landed,
     * so a failure never hides an occurrence locally either.
     */
    suspend fun splitSeries(
        event: PlannerEvent,
        fromOccurrence: Instant,
        patch: OccurrencePatch,
        newColor: PatchField<String?> = PatchField.Unchanged,
        newAttributes: JsonObject? = null,
    ): PlannerEvent {
        val result = write({ mutations.splitSeries(event, fromOccurrence, patch, newColor, newAttributes) }) { result ->
            dao.upsertEvents(listOfNotNull(result.original, result.created).map { it.toEntity() })
        }
        return result.created
    }

    /** "Delete this and following": end the series one second before [fromOccurrence]. */
    suspend fun deleteThisAndFuture(event: PlannerEvent, fromOccurrence: Instant): PlannerEvent =
        write({ mutations.deleteThisAndFuture(event, fromOccurrence) }) { storeLocally(it) }

    /**
     * Runs the Supabase write [remote], then mirrors its result into Room with
     * [local] — unless the cache was wiped (sign-out) while the request was
     * in flight — and asks the widgets to refresh.
     */
    private suspend fun <T> write(remote: suspend () -> T, local: suspend (T) -> Unit): T {
        val ticket = gate.ticket()
        val result = remote()
        gate.change(ticket, CacheArea.Events) { local(result) }
        widgets.requestRefresh()
        return result
    }

    private suspend fun storeLocally(event: PlannerEvent) {
        dao.upsertEvents(listOf(event.toEntity()))
    }

    private suspend fun deleteLocally(id: String) {
        db.withTransaction {
            dao.deleteOverridesOf(listOf(id))
            dao.deleteEvents(listOf(id))
        }
    }

    /** On a stale write, pull the latest row into Room before rethrowing. */
    private suspend fun <T> reloadingOnStale(id: String, block: suspend () -> T): T = try {
        block()
    } catch (e: StaleWriteException) {
        runCatching { reloadEvent(id) }
        throw e
    }

    private suspend fun reloadEvent(id: String) {
        val ws = session.requireSession().workspaceId
        write({ queries.fetchEvent(ws, id) }) { latest ->
            if (latest == null) deleteLocally(id) else storeLocally(latest)
        }
    }

    private companion object {
        /** Stay well under SQLite's bound-variable limit in `IN (...)` lists. */
        const val SQL_CHUNK = 500
    }
}
