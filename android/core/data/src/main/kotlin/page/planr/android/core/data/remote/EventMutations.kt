package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.model.DeletedEventSnapshot
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.model.OverridePrior
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.recurrence.EditSemantics
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput
import page.planr.android.core.recurrence.PatchField
import page.planr.android.core.recurrence.RRuleBuild
import page.planr.android.core.recurrence.RecurrenceEnd
import kotlin.time.Duration.Companion.seconds

/**
 * Event writes — the v1 subset of lib/supabase/mutations.ts with identical
 * column payloads and the same `updated_at` optimistic-concurrency guard.
 * Pure remote calls; the repositories apply the results to Room.
 */
class EventMutations @Inject constructor(
    private val gateway: PostgrestGateway,
) {

    /** `createEvent`: insert and return the stored row. */
    suspend fun createEvent(draft: page.planr.android.core.model.PlannerEventDraft): PlannerEvent =
        gateway.insert(SupabaseTables.EVENTS, listOf(EventPayloads.insertRow(draft)))
            .single()
            .decodeAs(PlannerEvent.serializer())

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
     * `splitSeries`: cap the original series and create the new one. The new
     * series inherits kind + category; [newColor] / [newAttributes] override
     * its own color / attributes when set.
     */
    suspend fun splitSeries(
        event: PlannerEvent,
        fromOccurrence: Instant,
        patch: OccurrencePatch,
        newColor: PatchField<String?> = PatchField.Unchanged,
        newAttributes: JsonObject? = null,
    ): SplitResult {
        val split = EditSemantics.splitThisAndFuture(event, fromOccurrence, patch)
        val capped = gateway.update(
            SupabaseTables.EVENTS,
            buildJsonObject {
                put("rrule", split.original.rrule)
                put("recurrence_ends_at", split.original.recurrenceEndsAt?.let(PostgresTime::toIso))
            },
            listOf(eq("id", split.original.id)),
        )
        var draft = split.newSeries
        if (newColor is PatchField.Value) draft = draft.copy(color = newColor.value)
        if (newAttributes != null) draft = draft.copy(attributes = newAttributes)
        val created = createEvent(draft)
        return SplitResult(
            original = capped.firstOrNull()?.decodeAs(PlannerEvent.serializer()),
            created = created,
        )
    }

    /** `deleteThisAndFuture`: cap the series with UNTIL one second before [fromOccurrence]. */
    suspend fun deleteThisAndFuture(event: PlannerEvent, fromOccurrence: Instant): PlannerEvent {
        val until = fromOccurrence - 1.seconds
        val rrule = RRuleBuild.parseRRule(event.rrule)?.let { form ->
            RRuleBuild.buildRRule(form.copy(end = RecurrenceEnd.Until(until)))
        }
        return updateEvent(
            event.id,
            EventPatch(rrule = PatchField.Value(rrule), recurrenceEndsAt = PatchField.Value(until)),
        )
    }

    companion object {
        /** The UNIQUE key of `event_overrides`. */
        const val OVERRIDE_CONFLICT = "event_id,occurrence_date"
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
