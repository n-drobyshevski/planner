package page.planr.android.core.ical

import java.time.Instant
import java.time.ZoneOffset
import page.planr.android.core.model.EventStatus
import page.planr.android.core.recurrence.RRules

/**
 * .ics (RFC 5545) → Planr event drafts, for the import review: a port of
 * lib/ical/parse.ts, replaying its golden fixtures (`IcsFixturesTest`).
 *
 * Only VEVENTs are read (VTODO / VJOURNAL / VALARM are skipped; VTIMEZONE
 * isn't needed: TZIDs resolve to IANA zones, Windows names included). Times
 * follow Planr's storage: all-day events are floating dates on UTC midnights
 * with an exclusive end; timed events are instants plus the zone their
 * recurrence expands in. Rules are stored bare (no DTSTART / "RRULE:"),
 * UNTIL in UTC. EXDATEs and RECURRENCE-ID replacements become the occurrence
 * instants to cancel on the series.
 */
object IcsParser {

    private const val DAY = 86_400_000L
    private const val HOUR = 3_600_000L

    private val SUPPORTED_FREQ = setOf("YEARLY", "MONTHLY", "WEEKLY", "DAILY")
    private val DATE_RE = Regex("""(\d{4})(\d{2})(\d{2})""")
    private val DATE_TIME_RE = Regex("""(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)""")
    private val DURATION_RE = Regex("""([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?""")
    private val ESCAPE_RE = Regex("""\\([nN,;\\])""")
    private val RRULE_PREFIX = Regex("^RRULE:", RegexOption.IGNORE_CASE)

    private class Prop(val name: String, val params: Map<String, String>, val value: String)

    /** Wall-clock fields: year, month (1-based), day, hour, minute, second. */
    private class Wall(val y: Int, val mo: Int, val d: Int, val h: Int, val mi: Int, val s: Int)

    private class ReadTime(
        val allDay: Boolean,
        val ms: Long,
        /** Resolved zone of a TZID'd time; "UTC" for a Z time; null for date / floating / unknown. */
        val zone: String?,
        val utc: Boolean,
        val unknownZone: Boolean,
        val wall: Wall,
    )

    private class Series(val allDay: Boolean, val zone: String, val wall: Wall)

    /** A built event; [exdates] is shared with every copy, as the JS array is. */
    private class Built(
        val event: IcsEvent,
        val exdates: MutableList<Long>,
        val recurrenceId: ReadTime?,
        val wall: Wall,
    )

    /**
     * Every VEVENT of [text] as an import draft, sorted by start (then title,
     * then key, in UTF-16 code-unit order). Replaced occurrences
     * (RECURRENCE-ID) of a series in the same file are cancelled on the series
     * and kept as their own one-off events. [viewerZone] reads floating times,
     * unknown TZIDs and all-day events.
     */
    fun parse(text: String, viewerZone: String): IcsParseResult {
        val raws = mutableListOf<List<Prop>>()
        val stack = mutableListOf<String>()
        var current: MutableList<Prop>? = null
        for (line in unfold(text)) {
            val prop = parseLine(line) ?: continue
            when (prop.name) {
                "BEGIN" -> {
                    val component = jsTrim(prop.value).uppercase()
                    stack += component
                    if (component == "VEVENT") current = mutableListOf()
                }
                "END" -> {
                    val component = jsTrim(prop.value).uppercase()
                    if (component == "VEVENT" && current != null) {
                        raws += current
                        current = null
                    }
                    val at = stack.lastIndexOf(component)
                    if (at >= 0) while (stack.size > at) stack.removeAt(stack.size - 1)
                }
                // Properties of the event itself, not of a nested VALARM.
                else -> if (current != null && stack.lastOrNull() == "VEVENT") current += prop
            }
        }

        var skipped = 0
        val built = mutableListOf<Built>()
        raws.forEachIndexed { index, props ->
            val b = buildEvent(index, props, viewerZone)
            if (b != null) built += b else skipped += 1
        }

        val masters = LinkedHashMap<String, Built>()
        for (b in built) {
            val uid = b.event.uid
            if (b.recurrenceId == null && uid != null && b.event.rrule != null && uid !in masters) masters[uid] = b
        }

        val pending = mutableListOf<Pair<IcsEvent, MutableList<Long>>>()
        val keys = HashSet<String>()
        for (b in built) {
            var event = b.event
            var exdates = b.exdates
            val rid = b.recurrenceId
            val uid = event.uid
            if (rid != null && uid != null) {
                val master = masters[uid]
                val replaced = if (master != null) {
                    occurrenceStart(rid, Series(master.event.allDay, master.event.timeZone, master.wall))
                } else {
                    rid.ms
                }
                master?.exdates?.add(replaced)
                val stamp = if (rid.allDay && (master == null || master.event.allDay)) {
                    utcStamp(replaced).substring(0, 8)
                } else {
                    utcStamp(replaced)
                }
                val newUid = "$uid#$stamp"
                event = event.copy(uid = newUid, key = newUid, rrule = null, recurrenceEndsAt = null)
                exdates = mutableListOf()
            }
            var key = event.key
            var n = 2
            while (key in keys) key = "${event.key}~${n++}"
            keys += key
            pending += event.copy(key = key) to exdates
        }
        // A series shares its exdates list, so replacements found after it are in.
        val events = pending
            .map { (event, exdates) -> event.copy(exdates = exdates.distinct().sorted()) }
            .sortedWith(compareBy<IcsEvent> { it.start }.thenBy { it.title }.thenBy { it.key })
        return IcsParseResult(events, skipped)
    }

    // --- Lexing ----------------------------------------------------------------

    /** Unfolds continuation lines (a leading space or tab joins the previous line). */
    private fun unfold(text: String): List<String> {
        val out = mutableListOf<String>()
        for (raw in text.replace("\r\n", "\n").replace('\r', '\n').split('\n')) {
            if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.isNotEmpty()) {
                out[out.size - 1] = out.last() + raw.substring(1)
            } else if (raw.isNotEmpty()) {
                out += raw
            }
        }
        return out
    }

    /** `NAME;P1=a;P2="b:c":value` → a [Prop]; null when the line has no value. */
    private fun parseLine(line: String): Prop? {
        var quoted = false
        var colon = -1
        for (i in line.indices) {
            val c = line[i]
            if (c == '"') {
                quoted = !quoted
            } else if (c == ':' && !quoted) {
                colon = i
                break
            }
        }
        if (colon < 0) return null
        val head = line.substring(0, colon)
        val value = line.substring(colon + 1)
        val parts = mutableListOf<String>()
        val current = StringBuilder()
        quoted = false
        for (c in head) {
            if (c == '"') quoted = !quoted
            if (c == ';' && !quoted) {
                parts += current.toString()
                current.setLength(0)
            } else {
                current.append(c)
            }
        }
        parts += current.toString()
        val params = LinkedHashMap<String, String>()
        for (p in parts.drop(1)) {
            val eq = p.indexOf('=')
            if (eq < 0) continue
            params[p.substring(0, eq).uppercase()] = p.substring(eq + 1).removePrefix("\"").removeSuffix("\"")
        }
        return Prop(parts[0].uppercase(), params, value)
    }

    /** TEXT unescaping: `\n \N \, \; \\`. */
    fun unescapeText(value: String): String = ESCAPE_RE.replace(value) { m ->
        val c = m.groupValues[1]
        if (c == "n" || c == "N") "\n" else c
    }

    // --- Times -------------------------------------------------------------------

    /** One date or date-time value; null when unreadable. */
    private fun readTime(value: String, params: Map<String, String>, viewerZone: String): ReadTime? {
        val v = jsTrim(value)
        val date = DATE_RE.matchEntire(v)
        if (date != null || params["VALUE"] == "DATE") {
            val m = date ?: DATE_TIME_RE.matchEntire(v) ?: return null
            val y = m.groupValues[1].toInt()
            val mo = m.groupValues[2].toInt()
            val d = m.groupValues[3].toInt()
            return ReadTime(
                allDay = true,
                ms = IcsZones.utcMillis(y, mo, d),
                zone = null,
                utc = false,
                unknownZone = false,
                wall = Wall(y, mo, d, 0, 0, 0),
            )
        }
        val m = DATE_TIME_RE.matchEntire(v) ?: return null
        val g = m.groupValues
        val wall = Wall(g[1].toInt(), g[2].toInt(), g[3].toInt(), g[4].toInt(), g[5].toInt(), g[6].toInt())
        if (g[7] == "Z") {
            return ReadTime(
                allDay = false,
                ms = IcsZones.utcMillis(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s),
                zone = "UTC",
                utc = true,
                unknownZone = false,
                wall = wall,
            )
        }
        val tzid = params["TZID"]
        val resolved = if (tzid.isNullOrEmpty()) null else IcsZones.resolveZone(tzid)
        val zone = resolved ?: viewerZone
        return ReadTime(
            allDay = false,
            ms = IcsZones.wallToInstant(zone, wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s),
            zone = resolved,
            utc = false,
            unknownZone = !tzid.isNullOrEmpty() && resolved == null,
            wall = wall,
        )
    }

    /** RFC 5545 DURATION (`P1D`, `PT1H30M`, `-P1W`) in ms; null when unreadable. */
    fun parseDuration(value: String): Long? {
        val v = jsTrim(value)
        val m = DURATION_RE.matchEntire(v) ?: return null
        if (v == "P" || v.endsWith("T")) return null
        val g = m.groupValues
        // Weeks, days, hours, minutes, seconds; absurdly long numbers are unreadable.
        val (w, d, h, mi, s) = (2..6).map { g[it].ifEmpty { "0" }.toIntOrNull() ?: return null }
        val ms = ((w * 7L + d) * 24 * 3600 + h * 3600L + mi * 60L + s) * 1000
        return if (g[1] == "-") -ms else ms
    }

    /** `YYYYMMDDTHHMMSSZ` of an instant. */
    private fun utcStamp(ms: Long): String {
        val t = Instant.ofEpochMilli(ms).atOffset(ZoneOffset.UTC)
        fun p(n: Int, w: Int = 2) = n.toString().padStart(w, '0')
        return "${p(t.year, 4)}${p(t.monthValue)}${p(t.dayOfMonth)}T${p(t.hour)}${p(t.minute)}${p(t.second)}Z"
    }

    // --- Rules -------------------------------------------------------------------

    /** A normalized rule and its UNTIL instant. */
    data class NormalizedRule(val rrule: String, val until: Long?)

    /**
     * The rule as Planr stores it — bare, DTSTART / TZID parts dropped, UNTIL
     * in UTC — and its UNTIL instant; null when the rule can't be expanded.
     * [allDay] / [zone] describe the event's start.
     */
    fun normalizeRRule(value: String, allDay: Boolean, zone: String): NormalizedRule? {
        val raw = RRULE_PREFIX.replaceFirst(jsTrim(value), "")
        val parts = mutableListOf<String>()
        var until: Long? = null
        var freq: String? = null
        for (part in raw.split(";")) {
            if (part.isEmpty()) continue
            val eq = part.indexOf('=')
            if (eq < 0) return null
            val key = part.substring(0, eq).uppercase()
            var v = part.substring(eq + 1)
            if (key == "DTSTART" || key == "TZID") continue
            if (key == "FREQ") freq = v.uppercase()
            if (key == "UNTIL") {
                val date = DATE_RE.matchEntire(v)
                val dateTime = DATE_TIME_RE.matchEntire(v)
                if (date != null) {
                    val (y, mo, d) = date.destructured.toList().take(3).map { it.toInt() }
                    // An all-day rule keeps its date UNTIL; a timed rule ends with that local day.
                    val end = if (allDay) IcsZones.utcMillis(y, mo, d) else IcsZones.wallToInstant(zone, y, mo, d, 23, 59, 59)
                    until = end
                    if (!allDay) v = utcStamp(end)
                } else if (dateTime != null) {
                    val g = dateTime.groupValues
                    val f = (1..6).map { g[it].toInt() }
                    val end = if (g[7] == "Z") {
                        IcsZones.utcMillis(f[0], f[1], f[2], f[3], f[4], f[5])
                    } else {
                        IcsZones.wallToInstant(zone, f[0], f[1], f[2], f[3], f[4], f[5])
                    }
                    until = end
                    v = utcStamp(end)
                } else {
                    return null
                }
            }
            parts += "$key=$v"
        }
        if (freq == null || freq !in SUPPORTED_FREQ) return null
        val rrule = parts.joinToString(";")
        if (!RRules.isValid(rrule)) return null
        return NormalizedRule(rrule, until)
    }

    // --- Events ------------------------------------------------------------------

    private fun List<Prop>.first(name: String): Prop? = firstOrNull { it.name == name }

    private fun List<Prop>.textOf(name: String): String? {
        val p = first(name) ?: return null
        return jsTrim(unescapeText(p.value)).ifEmpty { null }
    }

    /** An occurrence's start on [series]: a date on an all-day series, the series' wall time on a date for a timed one. */
    private fun occurrenceStart(t: ReadTime, series: Series): Long {
        val w = t.wall
        if (series.allDay) return IcsZones.utcMillis(w.y, w.mo, w.d)
        if (t.allDay) return IcsZones.wallToInstant(series.zone, w.y, w.mo, w.d, series.wall.h, series.wall.mi, series.wall.s)
        return t.ms
    }

    private fun buildEvent(index: Int, props: List<Prop>, viewerZone: String): Built? {
        val dtstart = props.first("DTSTART") ?: return null
        val start = readTime(dtstart.value, dtstart.params, viewerZone) ?: return null
        val warnings = mutableListOf<IcsWarning>()
        if (start.unknownZone) warnings += IcsWarning.ZoneUnknown

        val rruleProp = props.first("RRULE")
        val recurring = rruleProp != null
        val timeZone = when {
            start.allDay -> viewerZone
            start.utc -> if (recurring) "UTC" else viewerZone
            else -> start.zone ?: viewerZone
        }

        // End: DTEND, else DURATION, else a day (all-day) or an hour (timed).
        var end: Long? = null
        val dtend = props.first("DTEND")
        if (dtend != null) {
            val e = readTime(dtend.value, dtend.params, viewerZone)
            if (e != null) {
                end = if (start.allDay) {
                    if (e.allDay) e.ms else IcsZones.utcMillis(e.wall.y, e.wall.mo, e.wall.d)
                } else {
                    e.ms
                }
            }
        } else {
            val ms = props.first("DURATION")?.let { parseDuration(it.value) }
            if (ms != null) end = start.ms + ms
        }
        var finalEnd = end ?: (start.ms + if (start.allDay) DAY else HOUR)
        if (start.allDay && finalEnd < start.ms + DAY) finalEnd = start.ms + DAY
        if (finalEnd < start.ms) finalEnd = start.ms

        var rrule: String? = null
        var recurrenceEndsAt: Long? = null
        if (rruleProp != null) {
            val normalized = normalizeRRule(rruleProp.value, start.allDay, timeZone)
            if (normalized != null) {
                rrule = normalized.rrule
                recurrenceEndsAt = normalized.until
            } else {
                warnings += IcsWarning.RRuleUnsupported
            }
        }
        if (props.first("RDATE") != null) warnings += IcsWarning.RDateIgnored

        val series = Series(start.allDay, timeZone, start.wall)
        val exdates = mutableListOf<Long>()
        if (rrule != null) {
            for (p in props.filter { it.name == "EXDATE" }) {
                for (value in p.value.split(",")) {
                    val t = readTime(value, p.params, viewerZone) ?: continue
                    exdates += occurrenceStart(t, series)
                }
            }
        }

        val ridProp = props.first("RECURRENCE-ID")
        val recurrenceId = ridProp?.let { readTime(it.value, it.params, viewerZone) }

        val statusValue = jsTrim(props.first("STATUS")?.value ?: "").uppercase()
        val uid = props.textOf("UID")
        return Built(
            event = IcsEvent(
                key = uid ?: "#$index",
                uid = uid,
                title = props.textOf("SUMMARY") ?: "",
                description = props.textOf("DESCRIPTION"),
                location = props.textOf("LOCATION"),
                allDay = start.allDay,
                start = start.ms,
                end = finalEnd,
                timeZone = timeZone,
                rrule = rrule,
                recurrenceEndsAt = recurrenceEndsAt,
                exdates = emptyList(),
                status = if (statusValue == "TENTATIVE") EventStatus.Planned else EventStatus.Confirmed,
                cancelled = statusValue == "CANCELLED",
                warnings = warnings,
            ),
            exdates = exdates,
            recurrenceId = recurrenceId,
            wall = start.wall,
        )
    }
}
