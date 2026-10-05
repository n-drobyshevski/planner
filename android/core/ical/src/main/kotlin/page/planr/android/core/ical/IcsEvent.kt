package page.planr.android.core.ical

import page.planr.android.core.model.EventStatus

/** Why an imported event may not come out exactly as in its file (`IcsWarning` in parse.ts). */
enum class IcsWarning(val wire: String) {
    /** A TZID that names no zone we know: read in the viewer's zone. */
    ZoneUnknown("zone-unknown"),

    /** A repeat rule Planr can't expand: imported as its first occurrence only. */
    RRuleUnsupported("rrule-unsupported"),

    /** RDATE (extra dates) isn't supported: only the rule's dates import. */
    RDateIgnored("rdate-ignored"),
    ;

    companion object {
        fun fromWire(wire: String): IcsWarning? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * One VEVENT as an import draft — `IcsEvent` in lib/ical/parse.ts. Instants
 * are epoch milliseconds: all-day events sit on UTC midnights with an
 * exclusive end, timed ones are real instants plus the zone they (and their
 * rule) live in.
 */
data class IcsEvent(
    /** Unique within the file (UID, a replaced occurrence's UID#date, or #index). */
    val key: String,
    /** What duplicate detection matches on, kept on the event as `attributes.icalUid`. */
    val uid: String?,
    val title: String,
    val description: String?,
    val location: String?,
    val allDay: Boolean,
    val start: Long,
    val end: Long,
    /** IANA zone the event (and its rule) lives in. */
    val timeZone: String,
    /** Bare RRULE (`FREQ=…;UNTIL=…Z`), or null. */
    val rrule: String?,
    /** The rule's UNTIL as an instant (null for COUNT / open-ended / no rule). */
    val recurrenceEndsAt: Long?,
    /** Occurrence starts to cancel (EXDATE, and occurrences replaced by RECURRENCE-ID), ascending. */
    val exdates: List<Long>,
    /** [EventStatus.Planned] for STATUS:TENTATIVE, else [EventStatus.Confirmed]. */
    val status: EventStatus,
    /** STATUS:CANCELLED in the file. */
    val cancelled: Boolean,
    val warnings: List<IcsWarning>,
)

/** Every readable VEVENT, sorted; [skipped] counts those without a readable DTSTART. */
data class IcsParseResult(val events: List<IcsEvent>, val skipped: Int)
