package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.model.DeletedEventSnapshot
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.model.OverridePrior
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput
import page.planr.android.core.recurrence.PatchField

/**
 * Event writes — the v1 subset of lib/supabase/mutations.ts with identical
 * column payloads and the same `updated_at` optimistic-concurrency guard.
 * Pure remote calls; the repositories apply the results to Room.
 */
class EventMutations @Inject constructor(
    private val gateway: PostgrestGateway,
) {

    /** `createEvent`: insert and return the stored row. */
    suspend fun createEvent(draft: PlannerEventDraft): PlannerEvent =
        gateway.insert(SupabaseTables.EVENTS, listOf(EventPayloads.insertRow(draft)))
            .single()
            .decodeAs(PlannerEvent.serializer())

    /**
     * `createEventsBulk`: many events in a few statements, one
     * `INSERT … RETURNING` per [BULK_INSERT_CHUNK] drafts (an .ics import).
     * The rows come back in [drafts] order (Postgres returns a multi-row
     * INSERT's rows in VALUES order, and PostgREST keeps it). All or nothing:
     * if a chunk fails, the chunks already written are deleted again before
     * the failure is rethrown.
     */
    suspend fun createEvents(drafts: List<PlannerEventDraft>): List<PlannerEvent> {
        val created = ArrayList<PlannerEvent>(drafts.size)
        try {
            for (part in drafts.chunked(BULK_INSERT_CHUNK)) {
                val rows = gateway.insert(SupabaseTables.EVENTS, part.map(EventPayloads::insertRow))
                    .decodeAll(PlannerEvent.serializer())
                created += rows
                check(rows.size == part.size) { "Inserted ${rows.size} of ${part.size} events" }
            }
        } catch (e: Throwable) {
            withContext(NonCancellable) { runCatching { deleteEvents(created.map { it.id }) } }
            throw e
        }
        return created
    }

    /** `deleteEventsBulk`: deletes events by id (their overrides cascade), [BULK_DELETE_CHUNK] ids per request. */
    suspend fun deleteEvents(ids: List<String>) {
        for (part in ids.distinct().chunked(BULK_DELETE_CHUNK)) {
            gateway.delete(SupabaseTables.EVENTS, listOf(isIn("id", part)))
        }
    }

    /**
     * `insertCancelOverrides`: cancels many occurrences at once (an imported
     * series' EXDATEs), one bulk INSERT of [applyOverride]'s row shape per
     * [BULK_INSERT_CHUNK]. The series are new, so there is no prior override
     * to merge onto or to keep for an undo. Returns the stored rows.
     */
    suspend fun insertCancelOverrides(workspaceId: String, inputs: List<OverrideInput>): List<EventOverride> {
        require(inputs.all { it.type == OverrideType.Cancel }) { "Only cancel overrides are inserted in bulk" }
        return inputs.chunked(BULK_INSERT_CHUNK).flatMap { part ->
            gateway.insert(SupabaseTables.EVENT_OVERRIDES, part.map { EventPayloads.overrideRow(workspaceId, it) })
        }.decodeAll(EventOverride.serializer())
    }

    /**
     * `updateEvent`. With [expectedUpdatedAt] the write only lands if the row
     * still carries that `updated_at` (at ms resolution); otherwise — or when
     * RLS hides the row — it throws [StaleWriteException].
     */
    suspend fun updateEvent(
        id: String,
        patch: EventPatch,
        expectedUpdatedAt: Instant? = null,
    ): PlannerEvent {
        val filters = buildList {
            add(eq("id", id))
            if (expectedUpdatedAt != null) addAll(updatedAtGuard(expectedUpdatedAt))
        }
        val rows = gateway.update(SupabaseTables.EVENTS, EventPayloads.patchRow(patch), filters)
        val row = rows.firstOrNull() ?: throw StaleWriteException(SupabaseTables.EVENTS, id)
        return row.decodeAs(PlannerEvent.serializer())
    }

    /**
     * `deleteEventDeep`: snapshot the event and its overrides (which cascade),
     * then delete, so [restoreDeleted] can undo it.
     */
    suspend fun deleteEventDeep(id: String): DeletedEventSnapshot {
        val events = gateway.select(SupabaseTables.EVENTS, filters = listOf(eq("id", id)))
        val overrides = gateway.select(SupabaseTables.EVENT_OVERRIDES, filters = listOf(eq("event_id", id)))
        gateway.delete(SupabaseTables.EVENTS, listOf(eq("id", id)))
        return DeletedEventSnapshot(events, overrides)
    }

    /** `restoreDeleted` (event part): re-insert the raw rows verbatim. */
    suspend fun restoreDeleted(snapshot: DeletedEventSnapshot): RestoredEvents {
        val events = if (snapshot.events.isEmpty()) emptyList() else gateway.insert(SupabaseTables.EVENTS, snapshot.events)
        val overrides = if (snapshot.overrides.isEmpty()) {
            emptyList()
        } else {
            gateway.insert(SupabaseTables.EVENT_OVERRIDES, snapshot.overrides)
        }
        return RestoredEvents(
            events.decodeAll(PlannerEvent.serializer()),
            overrides.decodeAll(EventOverride.serializer()),
        )
    }

    /**
     * `applyOverride`: upsert a cancel/modify override for one occurrence.
     * The prior row is read best-effort first so the edit can be undone with
     * [revertOverride]; a failed read never blocks the edit.
     */
    suspend fun applyOverride(workspaceId: String, input: OverrideInput): AppliedOverride {
        val prior = runCatching {
            gateway.select(
                SupabaseTables.EVENT_OVERRIDES,
                filters = listOf(
                    eq("event_id", input.eventId),
                    eq("occurrence_date", PostgresTime.toIso(input.occurrenceDate)),
                ),
            ).singleOrNull()
        }.getOrNull()
        val stored = gateway.upsert(
            SupabaseTables.EVENT_OVERRIDES,
            listOf(EventPayloads.overrideRow(workspaceId, input)),
            onConflict = OVERRIDE_CONFLICT,
        )
        return AppliedOverride(
            prior = OverridePrior(prior),
            override = stored.firstOrNull()?.decodeAs(EventOverride.serializer()),
        )
    }

    /**
     * `revertOverride`: restore the prior override row, or remove the
     * override when there was none. Returns the restored row, if any.
     */
    suspend fun revertOverride(
        eventId: String,
        occurrenceDate: Instant,
        prior: OverridePrior,
    ): EventOverride? {
        val row = prior.row
        if (row != null) {
            return gateway.upsert(SupabaseTables.EVENT_OVERRIDES, listOf(row), OVERRIDE_CONFLICT)
                .firstOrNull()
                ?.decodeAs(EventOverride.serializer())
        }
        gateway.delete(
            SupabaseTables.EVENT_OVERRIDES,
            listOf(eq("event_id", eventId), eq("occurrence_date", PostgresTime.toIso(occurrenceDate))),
        )
        return null
    }

    /** `updateAll`: "all events" edits the master row (no concurrency guard, like the web). */
    suspend fun updateAll(event: PlannerEvent, patch: OccurrencePatch): PlannerEvent =
        updateEvent(event.id, EventPayloads.fromOccurrencePatch(EditSemantics.editAll(event, patch)))

    /**
     * `splitSeries`: create the new series, then cap the original. The new
     * series inherits kind + category; [newColor] / [newAttributes] override
     * its own color / attributes when set.
     *
     * All or nothing, in this order: a failed insert leaves the original
     * untouched, and a failed cap deletes the new series again before the
     * failure is rethrown. (Capping first would lose every future occurrence,
     * for both members, whenever the insert failed.)
     */
    suspend fun splitSeries(
        event: PlannerEvent,
        fromOccurrence: Instant,
        patch: OccurrencePatch,
        newColor: PatchField<String?> = PatchField.Unchanged,
        newAttributes: JsonObject? = null,
    ): SplitResult {
        val split = EditSemantics.splitThisAndFuture(event, fromOccurrence, patch)
        var draft = split.newSeries
        if (newColor is PatchField.Value) draft = draft.copy(color = newColor.value)
        if (newAttributes != null) draft = draft.copy(attributes = newAttributes)
        val created = createEvent(draft)
        val capped = try {
            gateway.update(
                SupabaseTables.EVENTS,
                buildJsonObject {
                    put("rrule", split.original.rrule)
                    put("recurrence_ends_at", split.original.recurrenceEndsAt?.let(PostgresTime::toIso))
                },
                listOf(eq("id", split.original.id)),
            )
        } catch (e: Throwable) {
            withContext(NonCancellable) { runCatching { deleteEvents(listOf(created.id)) } }
            throw e
        }
        return SplitResult(
            original = capped.firstOrNull()?.decodeAs(PlannerEvent.serializer()),
            created = created,
        )
    }

    /**
     * `deleteThisAndFuture`: cap the series with UNTIL one second before
     * [fromOccurrence], keeping the rest of the rule ([EditSemantics.capThisAndFuture]).
     */
    suspend fun deleteThisAndFuture(event: PlannerEvent, fromOccurrence: Instant): PlannerEvent {
        val cap = EditSemantics.capThisAndFuture(event, fromOccurrence)
        return updateEvent(
            event.id,
            EventPatch(rrule = PatchField.Value(cap.rrule), recurrenceEndsAt = PatchField.Value(cap.recurrenceEndsAt)),
        )
    }

    companion object {
        /** The UNIQUE key of `event_overrides`. */
        const val OVERRIDE_CONFLICT = "event_id,occurrence_date"

        /** Rows per bulk INSERT (keeps request bodies small; the web's `BULK_CHUNK`). */
        const val BULK_INSERT_CHUNK = 200

        /** Ids per bulk DELETE: they travel in the URL, so fewer than the web's 200 (as for override reads). */
        const val BULK_DELETE_CHUNK = 120
    }
}

/** Result of [EventMutations.applyOverride]: the undo token and the stored row. */
data class AppliedOverride(val prior: OverridePrior, val override: EventOverride?)

/** Result of [EventMutations.splitSeries]: the capped original (if returned) and the new series. */
data class SplitResult(val original: PlannerEvent?, val created: PlannerEvent)

/** Rows written back by [EventMutations.restoreDeleted]. */
data class RestoredEvents(val events: List<PlannerEvent>, val overrides: List<EventOverride>)

/**
 * `guardUpdatedAt`: `updated_at` is microsecond-precision in Postgres but the
 * app compares at ms resolution, so match the 1 ms window [expected] falls in.
 * A genuine edit elsewhere lands on a different millisecond and fails it.
 */
internal fun updatedAtGuard(expected: Instant): List<RowFilter> {
    val ms = expected.toEpochMilliseconds()
    return listOf(
        gte("updated_at", PostgresTime.toIso(ms)),
        lt("updated_at", PostgresTime.toIso(ms + 1)),
    )
}
