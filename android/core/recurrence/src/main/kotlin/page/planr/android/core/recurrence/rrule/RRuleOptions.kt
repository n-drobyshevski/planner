package page.planr.android.core.recurrence.rrule

/**
 * The options object `RRule.parseString` returns, and `RRule.optionsToString`
 * turns back into text — a port of rrule.js 2.8.1's `parsestring.ts` and
 * `optionstostring.ts`.
 *
 * Like the JS object it mirrors, it remembers the order keys were first set
 * (a key set to null keeps its slot), because `optionsToString` emits parts in
 * that order. That is what keeps a rewritten rule byte-identical to the web's,
 * e.g. `FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260402T045959Z`.
 *
 * Deviation: input that rrule.js would accept but then mishandle (a non-numeric
 * COUNT, a lowercase weekday, a key without `=`) throws [IllegalArgumentException]
 * here. Every well-formed RFC 5545 rule parses exactly as on the web.
 */
internal class RRuleOptions private constructor(
    private val values: LinkedHashMap<Key, Any?>,
) {
    /** rrule.js option keys; [rfcName] is what `optionsToString` prints. */
    enum class Key(val rfcName: String) {
        FREQ("FREQ"), DTSTART("DTSTART"), INTERVAL("INTERVAL"), WKST("WKST"),
        COUNT("COUNT"), UNTIL("UNTIL"), TZID("TZID"), BYSETPOS("BYSETPOS"),
        BYMONTH("BYMONTH"), BYMONTHDAY("BYMONTHDAY"), BYYEARDAY("BYYEARDAY"),
        BYWEEKNO("BYWEEKNO"), BYWEEKDAY("BYDAY"), BYHOUR("BYHOUR"),
        BYMINUTE("BYMINUTE"), BYSECOND("BYSECOND"), BYEASTER("BYEASTER"),
    }

    constructor() : this(LinkedHashMap())

    fun copy(): RRuleOptions = RRuleOptions(LinkedHashMap(values))

    /** Sets [key] (null clears the value but keeps the key's position, as in JS). */
    operator fun set(key: Key, value: Any?) {
        values[key] = value
    }

    val freq: Frequency? get() = values[Key.FREQ] as Frequency?
    val dtstart: Long? get() = values[Key.DTSTART] as Long?
    val tzid: String? get() = values[Key.TZID] as String?
    val until: Long? get() = values[Key.UNTIL] as Long?
    val wkst: Weekday? get() = values[Key.WKST] as Weekday?
    val interval: Int? get() = singleInt(Key.INTERVAL)
    val count: Int? get() = singleInt(Key.COUNT)
    val byeaster: Int? get() = values[Key.BYEASTER] as Int?

    @Suppress("UNCHECKED_CAST")
    fun ints(key: Key): List<Int>? = values[key] as List<Int>?

    @Suppress("UNCHECKED_CAST")
    val byweekday: List<Weekday>? get() = values[Key.BYWEEKDAY] as List<Weekday>?

    private fun singleInt(key: Key): Int? {
        val list = ints(key) ?: return null
        require(list.size == 1) { "${key.rfcName} takes a single number, got $list" }
        return list.single()
    }

    /** `RRule.optionsToString`: `[DTSTART…\n]RRULE:KEY=VALUE;…`, or "" when empty. */
    fun toRuleString(): String {
        val parts = mutableListOf<String>()
        var dtstartLine = ""
        for ((key, value) in values) {
            if (key == Key.TZID || value == null || (value is List<*> && value.isEmpty())) continue
            val out = when (key) {
                Key.FREQ -> (value as Frequency).name
                Key.WKST -> value.toString()
                Key.BYWEEKDAY -> (value as List<*>).joinToString(",")
                Key.DTSTART -> {
                    dtstartLine = dtstartLine(value as Long, tzid)
                    ""
                }
                Key.UNTIL -> UtcCalendar.toUntilString(value as Long, utc = tzid.isNullOrEmpty())
                else -> if (value is List<*>) value.joinToString(",") else value.toString()
            }
            if (out.isNotEmpty()) parts += "${key.rfcName}=$out"
        }
        val rule = if (parts.isEmpty()) "" else "RRULE:" + parts.joinToString(";")
        return listOf(dtstartLine, rule).filter { it.isNotEmpty() }.joinToString("\n")
    }

    companion object {
        /** `RRule.parseString`: up to two lines (DTSTART / RRULE) merged into one options object. */
        fun parse(text: String): RRuleOptions {
            val lines = text.split("\n").mapNotNull(::parseLine)
            val merged = RRuleOptions()
            lines.take(2).forEach { line -> merged.values.putAll(line.values) }
            return merged
        }

        private val HEADER = Regex("^([A-Z]+?)[:;]")
        private val DTSTART = Regex("""DTSTART(?:;TZID=([^:=]+?))?(?::|=)([^;\s]+)""", RegexOption.IGNORE_CASE)
        private val RRULE_PREFIX = Regex("^RRULE:", RegexOption.IGNORE_CASE)
        private val RULE_PREFIX = Regex("^(?:RRULE|EXRULE):", RegexOption.IGNORE_CASE)
        private val NUMBER = Regex("^[+-]?\\d+$")
        private val NTH_WEEKDAY = Regex("^([+-]?\\d{1,2})([A-Z]{2})$")

        private fun parseLine(raw: String): RRuleOptions? {
            // JS `replace(/^\s+|\s+$/, '')` has no `g` flag: it strips leading
            // whitespace if there is any, otherwise trailing whitespace.
            val line = if (raw.isNotEmpty() && raw[0].isWhitespace()) raw.trimStart() else raw.trimEnd()
            if (line.isEmpty()) return null
            val header = HEADER.find(line.uppercase()) ?: return parseRrule(line)
            return when (val key = header.groupValues[1]) {
                "RRULE", "EXRULE" -> parseRrule(line)
                "DTSTART" -> parseDtstart(line)
                else -> throw IllegalArgumentException("Unsupported RFC prop $key in $line")
            }
        }

        private fun parseDtstart(line: String): RRuleOptions {
            val options = RRuleOptions()
            val match = DTSTART.find(line) ?: return options
            val tzid = match.groupValues[1]
            if (tzid.isNotEmpty()) options[Key.TZID] = tzid
            options[Key.DTSTART] = UtcCalendar.parseUntilString(match.groupValues[2])
            return options
        }

        private fun parseRrule(line: String): RRuleOptions {
            val options = parseDtstart(line.replace(RRULE_PREFIX, ""))
            for (attr in line.replace(RULE_PREFIX, "").split(";")) {
                val pieces = attr.split("=")
                val key = pieces[0]
                val value = pieces.getOrNull(1)
                    ?: throw IllegalArgumentException("Unknown RRULE property '$key'")
                when (key.uppercase()) {
                    // An unknown FREQ reads as undefined in JS (and fails later, in RRule()).
                    "FREQ" -> options[Key.FREQ] = Frequency.entries.firstOrNull { it.name == value.uppercase() }
                    "WKST" -> options[Key.WKST] = Weekday.fromCode(value.uppercase())
                    "COUNT" -> options[Key.COUNT] = parseNumbers(value)
                    "INTERVAL" -> options[Key.INTERVAL] = parseNumbers(value)
                    "BYSETPOS" -> options[Key.BYSETPOS] = parseNumbers(value)
                    "BYMONTH" -> options[Key.BYMONTH] = parseNumbers(value)
                    "BYMONTHDAY" -> options[Key.BYMONTHDAY] = parseNumbers(value)
                    "BYYEARDAY" -> options[Key.BYYEARDAY] = parseNumbers(value)
                    "BYWEEKNO" -> options[Key.BYWEEKNO] = parseNumbers(value)
                    "BYHOUR" -> options[Key.BYHOUR] = parseNumbers(value)
                    "BYMINUTE" -> options[Key.BYMINUTE] = parseNumbers(value)
                    "BYSECOND" -> options[Key.BYSECOND] = parseNumbers(value)
                    "BYWEEKDAY", "BYDAY" -> options[Key.BYWEEKDAY] = parseWeekdays(value)
                    "DTSTART", "TZID" -> {
                        // Backwards compatibility in rrule.js: both read the DTSTART part.
                        val dtstart = parseDtstart(line)
                        options[Key.TZID] = dtstart.tzid
                        options[Key.DTSTART] = dtstart.dtstart
                    }
                    "UNTIL" -> options[Key.UNTIL] = UtcCalendar.parseUntilString(value)
                    "BYEASTER" -> options[Key.BYEASTER] = value.toIntOrNull()
                        ?: throw IllegalArgumentException("Invalid BYEASTER value: $value")
                    else -> throw IllegalArgumentException("Unknown RRULE property '$key'")
                }
            }
            return options
        }

        /** A number or comma list; kept as a list (rrule.js prints both the same way). */
        private fun parseNumbers(value: String): List<Int> = value.split(",").map { token ->
            require(NUMBER.matches(token)) { "Invalid number in RRULE: $token" }
            token.toInt()
        }

        private fun parseWeekdays(value: String): List<Weekday> = value.split(",").map { day ->
            if (day.length == 2) {
                Weekday.fromCode(day) ?: throw IllegalArgumentException("Invalid weekday string: $day")
            } else {
                val parts = NTH_WEEKDAY.find(day) ?: throw IllegalArgumentException("Invalid weekday string: $day")
                val base = Weekday.fromCode(parts.groupValues[2])
                    ?: throw IllegalArgumentException("Invalid weekday string: $day")
                Weekday(base.weekday, parts.groupValues[1].toInt())
            }
        }

        /** rrule.js `buildDtstart` / `DateWithZone.toString`. */
        private fun dtstartLine(dtstart: Long, tzid: String?): String {
            val isUtc = tzid.isNullOrEmpty() || tzid.uppercase() == "UTC"
            val stamp = UtcCalendar.toUntilString(dtstart, utc = isUtc)
            return if (isUtc) "DTSTART:$stamp" else "DTSTART;TZID=$tzid:$stamp"
        }
    }
}
