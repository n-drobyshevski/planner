package page.planr.android.core.ical

import java.util.regex.PatternSyntaxException

/** A compiled name filter, or why the pattern can't be used (`NameFilter` in review.ts). */
sealed interface NameFilter {
    data class Valid(val test: (String) -> Boolean) : NameFilter

    /** A `/…/` pattern that isn't a valid regular expression. */
    data object InvalidRegex : NameFilter

    /** Whether [title] passes; an unusable filter keeps nothing. */
    fun matches(title: String): Boolean = this is Valid && test(title)
}

/** An inclusive range of local days (ISO `yyyy-MM-dd`); either end may be open. */
data class DayRange(val from: String? = null, val to: String? = null)

/** An event already in Planr, as duplicate detection sees it. */
data class ExistingEvent(val icalUid: String?, val title: String, val start: Long, val end: Long)

/**
 * The .ics import review's rules — a port of lib/ical/review.ts: which events
 * a name / date filter keeps, which already exist in Planr, and which start
 * selected.
 */
object IcsReview {

    private const val DAY = 86_400_000L
    private const val GLOB_SPECIAL = ".+^\${}()|[]\\"

    /**
     * The review's name filter. Empty matches everything; `/…/` is a regular
     * expression; a pattern with `*` or `?` is a glob; anything else is a plain
     * substring. All case-insensitive (Unicode case folding, as `Regex`'s
     * IGNORE_CASE adds UNICODE_CASE), and all match anywhere in the title.
     */
    fun compileNameFilter(pattern: String): NameFilter {
        val p = jsTrim(pattern)
        if (p.isEmpty()) return NameFilter.Valid { true }
        if (p.length >= 2 && p.startsWith("/") && p.endsWith("/")) {
            val re = try {
                Regex(p.substring(1, p.length - 1), RegexOption.IGNORE_CASE)
            } catch (_: PatternSyntaxException) {
                return NameFilter.InvalidRegex
            }
            return NameFilter.Valid { title -> re.containsMatchIn(title) }
        }
        if ('*' in p || '?' in p) {
            val body = buildString {
                for (c in p) {
                    when {
                        c == '*' -> append(".*")
                        c == '?' -> append('.')
                        c in GLOB_SPECIAL -> append('\\').append(c)
                        else -> append(c)
                    }
                }
            }
            val re = Regex(body, RegexOption.IGNORE_CASE)
            return NameFilter.Valid { title -> re.containsMatchIn(title) }
        }
        val needle = p.lowercase()
        return NameFilter.Valid { title -> title.lowercase().contains(needle) }
    }

    /**
     * Whether [event] has something inside [range] in the viewer's [zone]. A
     * series counts from its first start to its UNTIL (open-ended and COUNT
     * series run on); all-day events are compared on their floating dates.
     */
    fun inRange(event: IcsEvent, range: DayRange, zone: String): Boolean {
        val lower = range.from?.let { if (event.allDay) floating(it) else dayStart(it, zone, 0) } ?: Long.MIN_VALUE
        val upper = range.to?.let { if (event.allDay) floating(it) + DAY else dayStart(it, zone, 1) } ?: Long.MAX_VALUE
        val last = lastEnd(event)
        // Half-open overlap; a zero-length event counts on its start.
        val endsAfter = last > lower || (last == event.start && event.start >= lower)
        return event.start < upper && endsAfter
    }

    /** True when [event] is already in Planr: the same UID, or the same title, start and end. */
    fun isDuplicate(event: IcsEvent, existing: List<ExistingEvent>): Boolean {
        val title = normalizeTitle(event.title)
        return existing.any { e ->
            (event.uid != null && e.icalUid == event.uid) ||
                (e.start == event.start && e.end == event.end && normalizeTitle(e.title) == title)
        }
    }

    /**
     * Whether [event] starts ticked: not a duplicate, not cancelled in the
     * file, and not entirely in the past at [now] (epoch ms).
     */
    fun selectedByDefault(event: IcsEvent, duplicate: Boolean, now: Long): Boolean {
        if (duplicate || event.cancelled) return false
        return lastEnd(event) > now
    }

    /** The end of the last occurrence; [Long.MAX_VALUE] for a series without UNTIL. */
    private fun lastEnd(event: IcsEvent): Long = when {
        event.rrule == null -> event.end
        event.recurrenceEndsAt == null -> Long.MAX_VALUE
        else -> event.recurrenceEndsAt + (event.end - event.start)
    }

    private fun normalizeTitle(title: String): String = jsTrim(title).replace(JS_WHITESPACE_RUN, " ").lowercase()

    private fun ymd(date: String): List<Int> = date.split("-").map { it.toInt() }

    /** The date's UTC midnight (an all-day event's floating day). */
    private fun floating(date: String): Long {
        val (y, m, d) = ymd(date)
        return IcsZones.utcMillis(y, m, d)
    }

    /** The start of the local day [plusDays] after [date] in [zone]. */
    private fun dayStart(date: String, zone: String, plusDays: Int): Long {
        val (y, m, d) = ymd(date)
        return IcsZones.wallToInstant(zone, y, m, d + plusDays)
    }
}
