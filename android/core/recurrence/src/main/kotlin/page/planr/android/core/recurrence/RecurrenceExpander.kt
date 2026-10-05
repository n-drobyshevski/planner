package page.planr.android.core.recurrence

import java.text.Collator
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.rrule.RRuleIterator
import page.planr.android.core.recurrence.rrule.RRuleOptions
import page.planr.android.core.recurrence.rrule.RRuleSpec

/**
 * Expands events (single + recurring) into concrete [Occurrence]s within a
 * window — the Kotlin port of `expandEvents` / `expandEvent` in
 * lib/recurrence/expand.ts, held to the same output by the golden fixtures.
 *
 * Semantics to preserve:
 * - Timed series expand in the event's own IANA zone in floating wall-clock
 *   space, so "09:00 daily" stays 09:00 local across DST. All-day series
 *   expand in UTC (occurrence dates sit exactly on UTC midnight).
 * - Expansion is bounded to the window plus a 36 h pad; never unbounded.
 * - `recurrence_ends_at` prunes the tail; `cancel` overrides drop an instance;
 *   `modify` overrides patch it (and are emitted even when the original
 *   instance fell outside the window but the moved one lands inside).
 * - Output is sorted by start, then title, then key.
 *
 * Like the web, a malformed `rrule` or an unknown `time_zone` throws
 * ([IllegalArgumentException] / `IllegalTimeZoneException`) rather than being
 * silently dropped; callers that must never fail can expand per event.
 */
interface RecurrenceExpander {

    /**
     * @param window half-open `[start, end)`; an occurrence is kept when it overlaps it.
     * @param viewerZone the zone the viewer reads the calendar in. Occurrence
     *   instants never depend on it (timed events use their own zone, all-day
     *   events UTC); it is accepted so callers can pass their context through,
     *   and is reserved for viewer-local bucketing. Web parity ignores it.
     * @param sharedCategoryIds ids of shared categories (`owner_id IS NULL`), used
     *   to derive [Occurrence.isShared] exactly like the web.
     */
    fun expand(
        events: List<PlannerEvent>,
        overrides: List<EventOverride>,
        window: TimeWindow,
        viewerZone: TimeZone? = null,
        sharedCategoryIds: Set<String> = emptySet(),
    ): List<Occurrence>

    /** One event's occurrences in [window], unsorted (`expandEvent` in expand.ts). */
    fun expandEvent(
        event: PlannerEvent,
        overrides: List<EventOverride>,
        window: TimeWindow,
        sharedCategoryIds: Set<String> = emptySet(),
    ): List<Occurrence>
}

/** The production expander. Stateless; safe to share. */
object DefaultRecurrenceExpander : RecurrenceExpander {

    /** Covers any single-jump DST skew at the window edges. */
    private const val PAD_MS = 36L * 60 * 60 * 1000

    override fun expand(
        events: List<PlannerEvent>,
        overrides: List<EventOverride>,
        window: TimeWindow,
        viewerZone: TimeZone?,
        sharedCategoryIds: Set<String>,
    ): List<Occurrence> {
        val out = events.flatMap { expandEvent(it, overrides, window, sharedCategoryIds) }
        return out.sortedWith(occurrenceOrder())
    }

    override fun expandEvent(
        event: PlannerEvent,
        overrides: List<EventOverride>,
        window: TimeWindow,
        sharedCategoryIds: Set<String>,
    ): List<Occurrence> {
        val out = mutableListOf<Occurrence>()
        val start = event.start.toEpochMilliseconds()
        val end = event.end.toEpochMilliseconds()

        // --- Single event -------------------------------------------------
        val rrule = event.rrule
        if (rrule.isNullOrEmpty()) {
            if (window.intersects(event.start, event.end)) {
                out += baseOccurrence(event, start, start, end, isRecurring = false, sharedCategoryIds)
            }
            return out
        }

        // --- Recurring event ----------------------------------------------
        // All-day events are floating dates anchored to UTC midnight (the same
        // calendar date for every viewer), so expand them in UTC: floating ==
        // real, keeping each occurrence_date exactly on UTC midnight for stable
        // override matching. Timed events expand in their own IANA zone.
        val zone = if (event.allDay) TimeZone.UTC else TimeZone.of(event.timeZone)
        val duration = end - start

        val rule = RRuleSpec.from(RRuleOptions.parse(rrule), dtstart = FloatingTime.fromReal(start, zone))

        // Bound expansion to the (padded) window, expressed in floating space.
        val floatAfter = FloatingTime.fromReal(window.start.toEpochMilliseconds() - PAD_MS, zone)
        val floatBefore = FloatingTime.fromReal(window.end.toEpochMilliseconds() + PAD_MS, zone)

        // Later rows win for a duplicated key, but keep the first one's slot (JS Map.set).
        val byOcc = LinkedHashMap<Long, EventOverride>()
        for (ov in overrides) {
            if (ov.eventId == event.id) byOcc[ov.occurrenceDate.toEpochMilliseconds()] = ov
        }

        val recurrenceEndsAt = event.recurrenceEndsAt?.toEpochMilliseconds()
        val emitted = HashSet<Long>()
        for (floatDate in RRuleIterator(rule).between(floatAfter, floatBefore, inc = true)) {
            val occurrenceDate = FloatingTime.toReal(floatDate, zone)

            // recurrenceEndsAt prunes the open-ended tail (real instant comparison).
            if (recurrenceEndsAt != null && occurrenceDate > recurrenceEndsAt) continue

            val ov = byOcc[occurrenceDate]
            if (ov?.type == OverrideType.Cancel) {
                emitted += occurrenceDate
                continue
            }

            var occ = baseOccurrence(
                event, occurrenceDate, occurrenceDate, occurrenceDate + duration,
                isRecurring = true, sharedCategoryIds,
            )
            if (ov?.type == OverrideType.Modify) occ = applyOverride(occ, ov)

            emitted += occurrenceDate
            if (window.intersects(occ.start, occ.end)) out += occ
        }

        // Modify-overrides whose NEW time lands in the window but whose original
        // occurrence fell outside the expansion (e.g. dragged in from elsewhere).
        for (ov in byOcc.values) {
            val occurrenceDate = ov.occurrenceDate.toEpochMilliseconds()
            if (ov.type != OverrideType.Modify || occurrenceDate in emitted) continue
            val movedStart = ov.start?.toEpochMilliseconds() ?: occurrenceDate
            val movedEnd = ov.end?.toEpochMilliseconds() ?: (movedStart + duration)
            if (!window.intersects(instant(movedStart), instant(movedEnd))) continue
            out += applyOverride(
                baseOccurrence(
                    event, occurrenceDate, occurrenceDate, occurrenceDate + duration,
                    isRecurring = true, sharedCategoryIds,
                ),
                ov,
            )
        }

        return out
    }

    private fun baseOccurrence(
        event: PlannerEvent,
        occurrenceDate: Long,
        start: Long,
        end: Long,
        isRecurring: Boolean,
        sharedCategoryIds: Set<String>,
    ): Occurrence = Occurrence(
        // Single events key on the (immutable) event id alone, so a reschedule
        // never moves the key; recurring instances key on id + ORIGINAL
        // occurrence date (stable across "this" edits).
        key = if (isRecurring) Occurrence.recurringKey(event.id, instant(occurrenceDate)) else event.id,
        eventId = event.id,
        occurrenceDate = instant(occurrenceDate),
        start = instant(start),
        end = instant(end),
        allDay = event.allDay,
        // inactive, status, color, kind, hiddenFromPublic, attributes are
        // series-level: overrides have no column for them.
        inactive = event.inactive,
        status = event.status,
        title = event.title,
        description = event.description,
        location = event.location,
        categoryId = event.categoryId,
        color = event.color,
        kind = event.kind,
        ownerId = event.ownerId,
        isPrivate = event.isPrivate,
        // Effective jointness: a non-private event that is explicitly shared or
        // filed under a shared category. A private event is never joint.
        isShared = !event.isPrivate &&
            (event.isShared || (event.categoryId != null && event.categoryId in sharedCategoryIds)),
        hiddenFromPublic = event.hiddenFromPublic,
        taskId = event.taskId,
        attributes = event.attributes,
        isRecurring = isRecurring,
        isException = false,
    )

    /** A `modify` override: non-null override columns win; series-level fields stay. */
    private fun applyOverride(occ: Occurrence, ov: EventOverride): Occurrence = occ.copy(
        title = ov.title ?: occ.title,
        description = ov.description ?: occ.description,
        location = ov.location ?: occ.location,
        categoryId = ov.categoryId ?: occ.categoryId,
        start = ov.start ?: occ.start,
        end = ov.end ?: occ.end,
        allDay = ov.allDay ?: occ.allDay,
        isException = true,
    )

    /**
     * Stable order: start, then title, then key. The web uses
     * `String.localeCompare` (the runtime's default locale), mirrored here by
     * the default-locale [Collator].
     */
    private fun occurrenceOrder(): Comparator<Occurrence> {
        val collator = Collator.getInstance()
        val text = Comparator<String> { a, b -> collator.compare(a, b) }
        return compareBy<Occurrence> { it.start }
            .thenBy(text) { it.title }
            .thenBy(text) { it.key }
    }

    private fun instant(ms: Long): Instant = Instant.fromEpochMilliseconds(ms)
}
