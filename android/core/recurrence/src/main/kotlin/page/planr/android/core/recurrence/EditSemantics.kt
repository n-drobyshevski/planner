package page.planr.android.core.recurrence

import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.recurrence.rrule.RRuleOptions

/**
 * Recurring-edit semantics: the data changes behind "this event / this and
 * following / all events". Port of lib/recurrence/edit-semantics.ts.
 *
 * Pure functions only — no I/O, no clock reads. They describe the mutations
 * the data layer should persist; they never perform them.
 */
object EditSemantics {

    /** "Delete this occurrence": a `cancel` override keyed on the original start. */
    fun cancelOccurrence(eventId: String, occurrenceDate: Instant): OverrideInput =
        OverrideInput(eventId, occurrenceDate, OverrideType.Cancel)

    /** "Edit only this occurrence": a `modify` override carrying [patch]. */
    fun modifyOccurrence(
        eventId: String,
        occurrenceDate: Instant,
        patch: OccurrencePatch,
    ): OverrideInput = OverrideInput(eventId, occurrenceDate, OverrideType.Modify, patch)

    /**
     * "All events": the fields to update on the master row. When [patch] moves
     * `start` without an explicit `end`, `end` shifts by the same delta so the
     * occurrence duration is preserved.
     */
    fun editAll(event: PlannerEvent, patch: OccurrencePatch): OccurrencePatch {
        val start: Instant?
        val end: Instant?
        if (patch.start != null) {
            start = patch.start
            // Preserve duration by shifting end by the same delta, unless end is given.
            end = patch.end ?: (event.end + (patch.start - event.start))
        } else {
            start = null
            end = patch.end
        }
        return OccurrencePatch(
            title = patch.title,
            description = patch.description,
            location = patch.location,
            categoryId = patch.categoryId,
            start = start,
            end = end,
            allDay = patch.allDay,
            inactive = patch.inactive,
            status = patch.status,
        )
    }

    /**
     * "This and following": end the original series just before the split
     * (UNTIL = [fromOccurrence] − 1 s, COUNT dropped) and start an open-ended
     * new series at the split carrying [patch] (FREQ/BY* rules kept, UNTIL/COUNT
     * dropped, duration preserved unless `patch.end` is given).
     */
    fun splitThisAndFuture(
        event: PlannerEvent,
        fromOccurrence: Instant,
        patch: OccurrencePatch,
    ): SeriesSplit {
        val until = fromOccurrence - 1.seconds

        // ---- original: set UNTIL just before the split point ----
        // Ending a series via UNTIL is mutually exclusive with COUNT (RFC 5545).
        val originalRrule = event.rrule?.takeIf { it.isNotEmpty() }?.let { rrule ->
            rewriteRule(rrule, until = until.toEpochMilliseconds())
        }
        val original = SeriesEnd(id = event.id, rrule = originalRrule, recurrenceEndsAt = until)

        // ---- newSeries: starts at the split, open-ended, carries the patch ----
        val newStart = patch.start ?: fromOccurrence
        val newEnd = patch.end ?: (event.end + (newStart - event.start))
        // Keep FREQ/BYDAY etc.; drop any prior UNTIL/COUNT so the new series is fresh.
        val newRrule = event.rrule?.takeIf { it.isNotEmpty() }?.let { rrule -> rewriteRule(rrule, until = null) }

        val newSeries = PlannerEventDraft(
            workspaceId = event.workspaceId,
            ownerId = event.ownerId,
            categoryId = patch.categoryId.orElse(event.categoryId),
            title = patch.title ?: event.title,
            description = patch.description.orElse(event.description),
            location = patch.location.orElse(event.location),
            isPrivate = event.isPrivate,
            isShared = event.isShared,
            hiddenFromPublic = event.hiddenFromPublic,
            color = event.color,
            kind = event.kind,
            allDay = patch.allDay ?: event.allDay,
            inactive = patch.inactive ?: event.inactive,
            status = patch.status ?: event.status,
            start = newStart,
            end = newEnd,
            timeZone = event.timeZone,
            rrule = newRrule,
            // New series is open-ended (prior UNTIL/COUNT dropped).
            recurrenceEndsAt = null,
            taskId = event.taskId,
            attributes = event.attributes,
        )
        return SeriesSplit(original, newSeries)
    }

    /**
     * "Delete this and following": cap the series just before [fromOccurrence]
     * (UNTIL = from − 1 s, COUNT dropped) — `capThisAndFuture` in
     * lib/recurrence/edit-semantics.ts. The same rewrite as the split's
     * original, so every other rule part (BYMONTH, BYSETPOS, BYDAY ordinals,
     * YEARLY…) survives and past occurrences stay where they were.
     */
    fun capThisAndFuture(event: PlannerEvent, fromOccurrence: Instant): SeriesEnd {
        val until = fromOccurrence - 1.seconds
        val rrule = event.rrule?.takeIf { it.isNotEmpty() }?.let { rewriteRule(it, until = until.toEpochMilliseconds()) }
        return SeriesEnd(id = event.id, rrule = rrule, recurrenceEndsAt = until)
    }

    /**
     * `RRule.parseString` → clear COUNT → set UNTIL ([until] null clears it) →
     * `RRule.optionsToString`, minus the "RRULE:" prefix. Part order follows
     * the original rule, so the string matches the web's byte for byte.
     */
    private fun rewriteRule(rrule: String, until: Long?): String {
        val options = RRuleOptions.parse(rrule)
        if (until == null) options[RRuleOptions.Key.UNTIL] = null
        options[RRuleOptions.Key.COUNT] = null
        if (until != null) options[RRuleOptions.Key.UNTIL] = until
        return options.toRuleString().replace(RRULE_PREFIX, "")
    }

    private val RRULE_PREFIX = Regex("^RRULE:", RegexOption.IGNORE_CASE)

    private fun <T> PatchField<T>.orElse(fallback: T): T = when (this) {
        PatchField.Unchanged -> fallback
        is PatchField.Value -> value
    }
}

/** The two writes a "this and following" edit needs. */
data class SeriesSplit(
    /** Patch for the existing series row: its new RRULE and pruning bound. */
    val original: SeriesEnd,
    /** Insert payload for the new series starting at the split point. */
    val newSeries: PlannerEventDraft,
)

/** The original series' updated recurrence: `{ id, rrule, recurrenceEndsAt }` in TS. */
data class SeriesEnd(
    val id: String,
    val rrule: String?,
    val recurrenceEndsAt: Instant?,
)
