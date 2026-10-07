package page.planr.android.core.data.notify

import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.sync.RowGone
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.PlannerEvent

/** One change the partner made to an event the viewer can see. */
data class PartnerChange(
    val kind: Kind,
    val eventId: String,
    val title: String,
    val start: Instant,
    val end: Instant,
    val allDay: Boolean = false,
    /** Where a [Kind.Moved] or [Kind.Resized] event started before. */
    val previousStart: Instant? = null,
    /** Where a [Kind.Moved] or [Kind.Resized] event ended before. */
    val previousEnd: Instant? = null,
) {
    enum class Kind {
        Added,

        /** Its start changed (its end may have too). */
        Moved,

        /** Only its end changed: longer or shorter, starting as before. */
        Resized,
        Cancelled,
        Removed,
    }
}

/** Who and when a change is judged for. */
data class PartnerScope(
    val viewerId: String,
    val partnerId: String,
    /** The viewer's sleep category; null = their inactive blocks are their sleep. */
    val sleepCategoryId: String?,
    val now: Instant,
    /** When "Partner's changes" was turned on: older edits are never reported. */
    val since: Instant,
) {
    /** The end of the window a change must touch: [PartnerChangeDetector.WINDOW] from [now]. */
    val horizon: Instant get() = now + PartnerChangeDetector.WINDOW
}

/**
 * Which cache changes are the partner's, worth a notification. Pure, so it
 * is unit-tested directly; [PartnerChangeNotifier] runs it.
 *
 * Reported: an event the viewer can see, whose last write was the
 * partner's (`updated_by`), made since the setting was turned on, that
 * starts (before or after the change) within [WINDOW] from now. All-day
 * events count while their day is still ahead or today. Added = a row not
 * cached before; Moved = its start changed; Resized = only its end did;
 * Cancelled = its status
 * turned cancelled. Removed comes only from a `row_gone` delete whose actor
 * is the partner: a refresh can't tell who removed a row.
 *
 * Left out: the viewer's own changes, contexts (backdrop bands), inactive
 * blocks, sleep (the viewer's sleep category, and the partner's sleep
 * blocks, recognised by the title both apps give them: the partner's sleep
 * category is private to them), and recurring series: a series, or one
 * occurrence moved or cancelled through an override, would need expanding
 * to tell whether the window is touched, so neither is reported.
 */
object PartnerChangeDetector {
    /** How far ahead a change must reach to be reported. */
    val WINDOW: Duration = 48.hours

    /** The titles the web and the app give a sleep block made from a tracked night (en, ru). */
    private val SLEEP_BLOCK_TITLES = setOf("Sleep", "Сон")

    /** [after] as stored now, [before] as it was cached (null: it wasn't). */
    fun changed(before: PlannerEvent?, after: PlannerEvent, scope: PartnerScope): PartnerChange? {
        if (after.updatedBy != scope.partnerId || scope.partnerId == scope.viewerId) return null
        if (after.updatedAt < scope.since) return null
        if (!reportable(after, scope) || (before != null && !reportable(before, scope))) return null
        val kind = when {
            before == null -> if (after.status == EventStatus.Cancelled) return null else PartnerChange.Kind.Added
            before.status != EventStatus.Cancelled && after.status == EventStatus.Cancelled -> PartnerChange.Kind.Cancelled
            after.status == EventStatus.Cancelled -> return null
            before.start != after.start -> PartnerChange.Kind.Moved
            before.end != after.end -> PartnerChange.Kind.Resized
            else -> return null
        }
        if (!inWindow(after, scope) && (before == null || !inWindow(before, scope))) return null
        val retimed = kind == PartnerChange.Kind.Moved || kind == PartnerChange.Kind.Resized
        return PartnerChange(
            kind = kind,
            eventId = after.id,
            title = after.title,
            start = after.start,
            end = after.end,
            allDay = after.allDay,
            previousStart = before?.start?.takeIf { retimed },
            previousEnd = before?.end?.takeIf { retimed },
        )
    }

    /** A deleted event ([gone]), with what was cached of it ([before]; null: nothing). */
    fun removed(before: PlannerEvent?, gone: RowGone, scope: PartnerScope): PartnerChange? {
        if (gone.table != SupabaseTables.EVENTS || gone.kind != RowGone.Kind.Delete) return null
        if (gone.actor != scope.partnerId || scope.partnerId == scope.viewerId) return null
        val title = gone.title ?: return null
        val start = gone.start ?: before?.start ?: return null
        val end = gone.end ?: before?.end ?: start
        if (before != null && (!reportable(before, scope) || before.status == EventStatus.Cancelled)) return null
        // Not cached: the broadcast's owner and title still tell the partner's sleep block.
        if (before == null && gone.ownerId == scope.partnerId && title.trim() in SLEEP_BLOCK_TITLES) return null
        val allDay = before?.allDay ?: false
        if (!inWindow(start, end, allDay, scope)) return null
        return PartnerChange(PartnerChange.Kind.Removed, gone.id, title, start, end, allDay)
    }

    /** Visible, a real event, not sleep or an inactive block, not a series. */
    private fun reportable(event: PlannerEvent, scope: PartnerScope): Boolean =
        !event.isPrivate &&
            event.kind == EventKind.Event &&
            !event.inactive &&
            !event.isRecurring &&
            !(scope.sleepCategoryId != null && event.categoryId == scope.sleepCategoryId) &&
            !(event.ownerId == scope.partnerId && !event.allDay && event.title.trim() in SLEEP_BLOCK_TITLES)

    private fun inWindow(event: PlannerEvent, scope: PartnerScope): Boolean =
        inWindow(event.start, event.end, event.allDay, scope)

    /** A timed event starting within the window; an all-day one whose days aren't over yet and begin by its end. */
    private fun inWindow(start: Instant, end: Instant, allDay: Boolean, scope: PartnerScope): Boolean =
        if (allDay) end > scope.now && start <= scope.horizon else start >= scope.now && start <= scope.horizon
}

/**
 * At most one partner-change notification per [interval]: the first
 * changes after a quiet spell post at once; those arriving within
 * [interval] of a post are held, merged, and posted together once it has
 * passed (the caller schedules that, see [Offer.WaitUntil]). Pure state,
 * driven by the times it is given.
 */
class PartnerChangeThrottle(private val interval: Duration = INTERVAL) {
    private val held = LinkedHashMap<String, PartnerChange>()
    private var lastPostAt: Instant? = null
    private var flushAt: Instant? = null

    sealed interface Offer {
        /** Post these now. */
        data class Post(val changes: List<PartnerChange>) : Offer

        /** Held: call [due] at [at]. */
        data class WaitUntil(val at: Instant) : Offer

        /** Held, with a [due] call already scheduled (or nothing left to post). */
        data object Held : Offer
    }

    fun offer(changes: List<PartnerChange>, now: Instant): Offer {
        changes.forEach(::merge)
        if (held.isEmpty()) return Offer.Held
        val next = lastPostAt?.plus(interval)
        if (next == null || now >= next) return Offer.Post(take(now))
        if (flushAt != null) return Offer.Held
        flushAt = next
        return Offer.WaitUntil(next)
    }

    /** What is held, to post now (the [Offer.WaitUntil] time has come); empty when nothing is. */
    fun due(now: Instant): List<PartnerChange> {
        flushAt = null
        return if (held.isEmpty()) emptyList() else take(now)
    }

    /** Forgets what is held (sign-out, or the app came to the foreground: the changes are on screen). */
    fun clear() {
        held.clear()
        flushAt = null
    }

    private fun take(now: Instant): List<PartnerChange> {
        val changes = held.values.toList()
        held.clear()
        lastPostAt = now
        return changes
    }

    /** One entry per event: what a reader needs to know of the changes since the last post. */
    private fun merge(change: PartnerChange) {
        val prev = held[change.eventId]
        val merged = when {
            prev == null -> change
            // Added, then changed again: still new to the reader, unless it went again.
            prev.kind == PartnerChange.Kind.Added -> when (change.kind) {
                PartnerChange.Kind.Removed, PartnerChange.Kind.Cancelled -> null
                else -> change.copy(kind = PartnerChange.Kind.Added, previousStart = null, previousEnd = null)
            }
            // Moved or resized twice: from where it was first, by what changed overall;
            // back where it was (start and end): nothing to say.
            prev.retimed && change.retimed -> retimed(change.copy(previousStart = prev.previousStart, previousEnd = prev.previousEnd))
            else -> change
        }
        held.remove(change.eventId)
        if (merged != null) held[change.eventId] = merged
    }

    private val PartnerChange.retimed: Boolean
        get() = kind == PartnerChange.Kind.Moved || kind == PartnerChange.Kind.Resized

    /** [change] judged against where it was first: moved, resized, or (null) back as it was. */
    private fun retimed(change: PartnerChange): PartnerChange? = when {
        change.previousStart != change.start -> change.copy(kind = PartnerChange.Kind.Moved)
        change.previousEnd != null && change.previousEnd != change.end -> change.copy(kind = PartnerChange.Kind.Resized)
        else -> null
    }

    companion object {
        val INTERVAL: Duration = 2.minutes
    }
}
