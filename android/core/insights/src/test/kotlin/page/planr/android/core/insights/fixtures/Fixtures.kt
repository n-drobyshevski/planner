package page.planr.android.core.insights.fixtures

import java.math.BigDecimal
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.fail
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.DynamicTest.dynamicTest
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.model.Anomaly
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.CategoryBuckets
import page.planr.android.core.insights.model.CategoryRating
import page.planr.android.core.insights.model.CategoryShare
import page.planr.android.core.insights.model.CategoryUsage
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.DaypartRating
import page.planr.android.core.insights.model.DeepWorkShare
import page.planr.android.core.insights.model.Delta
import page.planr.android.core.insights.model.EnergyDayLoad
import page.planr.android.core.insights.model.EnergySummary
import page.planr.android.core.insights.model.Fragmentation
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.HeatmapCell
import page.planr.android.core.insights.model.HourHeatmap
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.LeadTime
import page.planr.android.core.insights.model.Lede
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.LedeTone
import page.planr.android.core.insights.model.MemberUsage
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.PerDayPoint
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.RatedAggregate
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.model.RollingPoint
import page.planr.android.core.insights.model.SeriesKeys
import page.planr.android.core.insights.model.ShareRow
import page.planr.android.core.insights.model.ShareRowId
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.model.Streak
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.Usage
import page.planr.android.core.insights.model.UsageSummary
import page.planr.android.core.insights.model.VelocityPoint
import page.planr.android.core.insights.model.WeekdayUsage
import page.planr.android.core.model.EventKind

/**
 * The Insights golden fixtures (src/test/resources/fixtures/<area>.json,
 * exported from the real web code by `pnpm fixtures:insights`; schema in
 * scripts/insights-fixtures.ts): loading, one dynamic test per case, the
 * comparator, decoders for the common input shapes, and encoders that turn
 * every frozen model type back into the TS output shape.
 *
 * Never edit the expectations: if Kotlin disagrees with a fixture, fix the
 * Kotlin (or fix the web first and regenerate).
 */
object Fixtures {

    private val json = Json { isLenient = false }
    private val files = HashMap<String, JsonObject>()

    // --- Loading and running -------------------------------------------------------

    /** The parsed `/fixtures/<area>.json` from the test classpath. */
    fun file(area: String): JsonObject = synchronized(files) {
        files.getOrPut(area) {
            val text = checkNotNull(Fixtures::class.java.getResource("/fixtures/$area.json")) {
                "fixtures/$area.json missing from src/test/resources (run `pnpm fixtures:insights`)"
            }.readText()
            json.parseToJsonElement(text).jsonObject
        }
    }

    private fun sections(area: String): JsonObject = file(area).getValue("sections").jsonObject

    fun cases(area: String, section: String): List<JsonObject> {
        val cases = checkNotNull(sections(area)[section]) { "$area.json has no section \"$section\"" }
        return cases.jsonArray.map { it.jsonObject }
    }

    /** One [DynamicTest] per case: `actual = run(case.input)`, then [assertMatches] against `expected`. */
    fun section(area: String, section: String, run: (JsonObject) -> JsonElement): List<DynamicTest> =
        cases(area, section).map { case ->
            val name = case.getValue("name").jsonPrimitive.content
            dynamicTest(name) {
                assertMatches(case.getValue("expected"), run(case.getValue("input").jsonObject))
            }
        }

    /** Every section in the area's file is replayed: [replayed] lists the test class's factories. */
    fun assertSections(area: String, replayed: Set<String>) {
        assertEquals(replayed, sections(area).keys, "$area.json sections vs the replayed ones")
    }

    // --- Comparator --------------------------------------------------------------------

    /**
     * Objects compare by key set and per key; arrays by length and in order.
     * An integer-looking expected number must match exactly; any other number
     * within `1e-12 · max(1, |a|, |e|)`. Strings and booleans exactly, null to null.
     */
    fun assertMatches(expected: JsonElement, actual: JsonElement) {
        val problems = ArrayList<String>()
        compare("$", expected, actual, problems)
        if (problems.isNotEmpty()) {
            fail(problems.take(MAX_REPORTED).joinToString("\n") + if (problems.size > MAX_REPORTED) "\n…" else "")
        }
    }

    private const val MAX_REPORTED = 10

    private fun compare(path: String, e: JsonElement, a: JsonElement, out: MutableList<String>) {
        when (e) {
            is JsonNull -> if (a !is JsonNull) out += "$path: expected null, got $a"
            is JsonObject -> {
                if (a !is JsonObject) {
                    out += "$path: expected an object, got $a"
                    return
                }
                if (e.keys != a.keys) {
                    out += "$path: expected keys ${e.keys.sorted()}, got ${a.keys.sorted()}"
                    return
                }
                for (key in e.keys) compare("$path.$key", e.getValue(key), a.getValue(key), out)
            }
            is JsonArray -> {
                if (a !is JsonArray) {
                    out += "$path: expected an array, got $a"
                    return
                }
                if (e.size != a.size) {
                    out += "$path: expected ${e.size} items, got ${a.size}"
                    return
                }
                e.indices.forEach { compare("$path[$it]", e[it], a[it], out) }
            }
            is JsonPrimitive -> comparePrimitive(path, e, a, out)
        }
    }

    private fun comparePrimitive(path: String, e: JsonPrimitive, a: JsonElement, out: MutableList<String>) {
        val mismatch = "$path: expected $e, got $a"
        if (a !is JsonPrimitive || a is JsonNull) {
            out += mismatch
            return
        }
        if (e.isString || e.content == "true" || e.content == "false") {
            if (e.isString != a.isString || e.content != a.content) out += mismatch
            return
        }
        // A number.
        if (a.isString) {
            out += mismatch
            return
        }
        val av = a.content.toBigDecimalOrNull() ?: run {
            out += mismatch
            return
        }
        val integerLooking = e.content.none { it == '.' || it == 'e' || it == 'E' }
        if (integerLooking) {
            if (BigDecimal(e.content).compareTo(av) != 0) out += mismatch
        } else {
            val ed = e.content.toDouble()
            val ad = av.toDouble()
            val tolerance = 1e-12 * maxOf(1.0, kotlin.math.abs(ad), kotlin.math.abs(ed))
            if (kotlin.math.abs(ad - ed) > tolerance) out += mismatch
        }
    }

    // --- Decoders ----------------------------------------------------------------------

    fun JsonObject.long(k: String): Long = getValue(k).jsonPrimitive.long

    fun JsonObject.longOrNull(k: String): Long? = get(k)?.takeIf { it !is JsonNull }?.jsonPrimitive?.long

    fun JsonObject.int(k: String): Int = getValue(k).jsonPrimitive.int

    fun JsonObject.double(k: String): Double = getValue(k).jsonPrimitive.double

    fun JsonObject.boolean(k: String): Boolean = getValue(k).jsonPrimitive.boolean

    fun JsonObject.string(k: String): String = getValue(k).jsonPrimitive.content

    fun JsonObject.stringOrNull(k: String): String? = get(k)?.jsonPrimitive?.contentOrNull

    fun JsonObject.longs(k: String): List<Long> = getValue(k).jsonArray.map { it.jsonPrimitive.long }

    fun JsonObject.strings(k: String): List<String> = getValue(k).jsonArray.map { it.jsonPrimitive.content }

    fun JsonObject.window(k: String): MsWindow = window(getValue(k).jsonObject)

    fun JsonObject.spans(k: String): List<Span> = getValue(k).jsonArray.map { span(it.jsonObject) }

    fun JsonObject.tasks(k: String): List<InsightTask> = getValue(k).jsonArray.map { task(it.jsonObject) }

    fun JsonObject.zone(k: String): ZoneId = ZoneId.of(string(k))

    fun JsonObject.granularity(k: String): Granularity =
        checkNotNull(Granularity.fromId(string(k))) { "unknown granularity ${string(k)}" }

    fun JsonObject.preset(k: String): PeriodPreset =
        checkNotNull(PeriodPreset.fromId(string(k))) { "unknown preset ${string(k)}" }

    fun window(o: JsonObject): MsWindow = MsWindow(o.long("start"), o.long("end"))

    /** SpanJson → [Span], attributes through [Attributes.parse] like the web's mapper. */
    fun span(o: JsonObject): Span = Span(
        key = o.string("key"),
        eventId = o.string("eventId"),
        title = o.string("title"),
        start = o.long("start"),
        end = o.long("end"),
        kind = when (val kind = o.string("kind")) {
            "event" -> EventKind.Event
            "context" -> EventKind.Context
            else -> error("unknown kind $kind")
        },
        allDay = o.boolean("allDay"),
        inactive = o.boolean("inactive"),
        ownerId = o.string("ownerId"),
        isShared = o.boolean("isShared"),
        categoryId = o.stringOrNull("categoryId"),
        attributes = Attributes.parse(o["attributes"]),
    )

    /** TaskJson → [InsightTask]. */
    fun task(o: JsonObject): InsightTask = InsightTask(
        id = o.string("id"),
        title = o.string("title"),
        parentId = o.stringOrNull("parentId"),
        collectionId = o.stringOrNull("collectionId"),
        ownerId = o.string("ownerId"),
        assigneeId = o.stringOrNull("assigneeId"),
        createdAt = o.long("createdAt"),
        completedAt = o.longOrNull("completedAt"),
        dueDate = o.stringOrNull("dueDate")?.let(LocalDate::parse),
    )

    // --- Encoders (TS output shapes, enums as their TS ids) ------------------------------

    fun num(v: Long?): JsonElement = if (v == null) JsonNull else JsonPrimitive(v)

    fun num(v: Int?): JsonElement = if (v == null) JsonNull else JsonPrimitive(v)

    fun num(v: Double?): JsonElement = if (v == null) JsonNull else JsonPrimitive(v)

    fun str(v: String?): JsonElement = if (v == null) JsonNull else JsonPrimitive(v)

    fun array(items: List<JsonElement>): JsonArray = JsonArray(items)

    fun longs(values: List<Long>): JsonArray = JsonArray(values.map(::JsonPrimitive))

    fun strings(values: List<String>): JsonArray = JsonArray(values.map(::JsonPrimitive))

    fun json(w: MsWindow): JsonElement = obj("start" to num(w.start), "end" to num(w.end))

    fun json(d: DayUsage?): JsonElement = d?.let { obj("dayMs" to num(it.dayMs), "ms" to num(it.ms)) } ?: JsonNull

    fun json(c: CategoryUsage): JsonElement = obj("categoryId" to str(c.categoryId), "ms" to num(c.ms))

    fun json(m: MemberUsage): JsonElement = obj("ownerId" to str(m.ownerId), "ms" to num(m.ms))

    fun json(s: UsageSummary): JsonElement = obj(
        "totalMs" to num(s.totalMs),
        "eventCount" to num(s.eventCount),
        "activeDays" to num(s.activeDays),
        "dailyAverageMs" to num(s.dailyAverageMs),
        "busiestDay" to json(s.busiestDay),
    )

    fun json(u: Usage): JsonElement = obj(
        "summary" to json(u.summary),
        "perDay" to array(u.perDay.map { json(it) }),
        "byCategory" to array(u.byCategory.map { json(it) }),
        "byMember" to array(u.byMember.map { json(it) }),
    )

    fun json(b: BucketUsage?): JsonElement =
        b?.let { obj("start" to num(it.start), "end" to num(it.end), "ms" to num(it.ms)) } ?: JsonNull

    fun json(r: RollingPoint): JsonElement = obj("dayMs" to num(r.dayMs), "avgMs" to num(r.avgMs))

    fun json(cb: CategoryBuckets): JsonElement = obj(
        "seriesKeys" to strings(cb.seriesKeys),
        "rows" to array(
            cb.rows.map { row ->
                obj(
                    "start" to num(row.start),
                    "end" to num(row.end),
                    "byKey" to JsonObject(row.byKey.mapValues { (_, ms) -> num(ms) }),
                )
            },
        ),
    )

    fun json(d: Delta): JsonElement = obj("delta" to num(d.delta), "deltaPct" to num(d.deltaPct))

    fun json(t: TrendDirection): JsonElement =
        obj("slopeMsPerBucket" to num(t.slopeMsPerBucket), "direction" to str(t.direction?.id))

    fun json(s: Streak?): JsonElement =
        s?.let { obj("current" to num(it.current), "longest" to num(it.longest)) } ?: JsonNull

    fun json(a: Anomaly): JsonElement = obj(
        "dayMs" to num(a.dayMs),
        "ms" to num(a.ms),
        "z" to num(a.z),
        "direction" to str(a.direction.id),
    )

    fun json(s: CategoryShare): JsonElement = obj(
        "categoryId" to str(s.categoryId),
        "ms" to num(s.ms),
        "share" to num(s.share),
        "prevMs" to num(s.prevMs),
        "prevShare" to num(s.prevShare),
        "deltaShare" to num(s.deltaShare),
    )

    fun json(w: WeekdayUsage): JsonElement = obj(
        "weekday" to num(w.weekday),
        "totalMs" to num(w.totalMs),
        "avgMs" to num(w.avgMs),
        "dayCount" to num(w.dayCount),
    )

    fun json(c: HeatmapCell): JsonElement = obj("weekday" to num(c.weekday), "hour" to num(c.hour), "ms" to num(c.ms))

    /** The compact fixture form: `{ cells: ms[168] by index weekday*24+hour, maxMs }`. */
    fun json(h: HourHeatmap): JsonElement = obj("cells" to longs(h.cells.map { it.ms }), "maxMs" to num(h.maxMs))

    fun json(f: Fragmentation): JsonElement = obj(
        "blockCount" to num(f.blockCount),
        "avgBlockMs" to num(f.avgBlockMs),
        "medianBlockMs" to num(f.medianBlockMs),
        "longestBlockMs" to num(f.longestBlockMs),
        "shortBlockShare" to num(f.shortBlockShare),
        "avgGapMs" to num(f.avgGapMs),
    )

    fun json(r: RatedAggregate): JsonElement = obj("mean" to num(r.mean), "n" to num(r.n), "ms" to num(r.ms))

    fun json(c: CategoryRating): JsonElement = obj("categoryId" to str(c.categoryId), "agg" to json(c.agg))

    fun json(e: EnergyDayLoad): JsonElement = obj(
        "dayMs" to num(e.dayMs),
        "weightedMs" to num(e.weightedMs),
        "ratedMs" to num(e.ratedMs),
        "totalMs" to num(e.totalMs),
    )

    fun json(d: DeepWorkShare): JsonElement = obj(
        "deepMs" to num(d.deepMs),
        "shallowMs" to num(d.shallowMs),
        "unratedMs" to num(d.unratedMs),
        "share" to num(d.share),
    )

    fun json(d: DaypartRating?): JsonElement =
        d?.let { obj("daypart" to str(it.daypart.id), "agg" to json(it.agg)) } ?: JsonNull

    fun json(t: TaskStats): JsonElement = obj(
        "createdCount" to num(t.createdCount),
        "completedCount" to num(t.completedCount),
        "dueCount" to num(t.dueCount),
        "adherenceRate" to num(t.adherenceRate),
        "overdueOpenCount" to num(t.overdueOpenCount),
        "completionRate" to num(t.completionRate),
        "medianLeadTimeMs" to num(t.medianLeadTimeMs),
    )

    fun json(v: VelocityPoint): JsonElement = obj(
        "start" to num(v.start),
        "end" to num(v.end),
        "created" to num(v.created),
        "completed" to num(v.completed),
    )

    /**
     * `LedeJson`: `{ tone, headline: { key, args }, support }`, args encoded as
     * the TS side recorded them (durations formatted in "en", sentinels for labels).
     */
    fun json(l: Lede?): JsonElement = l?.let {
        obj(
            "tone" to str(if (it.tone == LedeTone.Attention) "attention" else "neutral"),
            "headline" to json(it.headline),
            "support" to (it.support?.let(::json) ?: JsonNull),
        )
    } ?: JsonNull

    fun json(line: LedeLine): JsonElement = obj(
        "key" to str(line.key),
        "args" to JsonObject(line.args.mapValues { (_, arg) -> json(arg) }),
    )

    fun json(arg: LedeArg): JsonElement = when (arg) {
        is LedeArg.Duration -> str(DurationFormat.format(arg.ms, LabelLocale.En))
        is LedeArg.Num -> num(arg.value)
        is LedeArg.Select -> str(arg.token)
        is LedeArg.Category -> str("CATEGORY:" + arg.seriesKey)
        is LedeArg.BucketRef -> str("BUCKET:" + arg.start + "-" + arg.end)
        is LedeArg.Weekday -> str("WEEKDAY:" + arg.index)
        is LedeArg.DaypartRef -> str("DAYPART:" + arg.daypart.id)
    }

    /** view-selectors.ts `PerDayPoint`: `{ key, ms, avg, prevMs? }` (prevMs absent past the previous period). */
    fun json(p: PerDayPoint): JsonElement = JsonObject(
        buildMap {
            put("key", str(p.dayMs.toString()))
            put("ms", num(p.ms))
            put("avg", num(p.avgMs))
            if (p.prevMs != null) put("prevMs", num(p.prevMs))
        },
    )

    /** view-selectors.ts `ShareRow`: `{ id, seriesKey, ms }` (`id` "uncategorized" / "other"). */
    fun json(r: ShareRow): JsonElement = when (val id = r.id) {
        is ShareRowId.Series -> obj(
            "id" to str(if (id.key == SeriesKeys.UNCATEGORIZED) "uncategorized" else id.key),
            "seriesKey" to str(id.key),
            "ms" to num(r.ms),
        )
        ShareRowId.Other -> obj("id" to str("other"), "seriesKey" to JsonNull, "ms" to num(r.ms))
    }

    fun json(t: TotalChange): JsonElement = obj("trend" to str(t.trend.id), "pct" to num(t.pct))

    fun json(e: EnergySummary): JsonElement = obj(
        "meanEnergy" to num(e.meanEnergy),
        "ratedMs" to num(e.ratedMs),
        "totalMs" to num(e.totalMs),
        "coveragePct" to num(e.coveragePct),
    )

    fun json(l: LeadTime): JsonElement = when (l) {
        is LeadTime.Short -> obj("kind" to str("short"), "ms" to num(l.ms))
        is LeadTime.DaysHours -> obj("kind" to str("daysHours"), "days" to num(l.days), "hours" to num(l.hours))
    }

    /** The day-detail fixture shape: `{ dayEnd, itemKeys, totalMs }`. */
    fun json(d: DayDetailModel): JsonElement = obj(
        "dayEnd" to num(d.dayEnd),
        "itemKeys" to strings(d.items.map { it.key }),
        "totalMs" to num(d.totalMs),
    )

    /** A resolved period's own fields (the period area adds its per-granularity rows itself). */
    fun json(p: ResolvedPeriod): JsonElement = obj(
        "window" to json(p.window),
        "prevWindow" to json(p.prevWindow),
        "days" to longs(p.days),
        "prevDays" to longs(p.prevDays),
        "clamped" to JsonPrimitive(p.clamped),
        "granularity" to str(p.granularity.id),
        "bucketStarts" to longs(p.buckets.map { it.start }),
    )

    /** Known attribute keys present after parsing (the attributes area shape). */
    fun json(a: Attributes): JsonElement = buildJsonObject {
        a.energy?.let { put("energy", it) }
        a.flexibility?.let { put("flexibility", it.wire) }
        a.focus?.let { put("focus", it.wire) }
        a.satisfaction?.let { put("satisfaction", it) }
    }

    fun obj(vararg entries: Pair<String, JsonElement>): JsonObject = JsonObject(linkedMapOf(*entries))
}
