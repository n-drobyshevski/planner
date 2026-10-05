package page.planr.android.core.ical

import kotlin.test.assertEquals
import kotlin.test.fail
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.PlanrJson

/**
 * Golden parity with the web: every case in ics-fixtures.json (exported from
 * the real lib/ical code by scripts/export-ics-fixtures.ts; schema in
 * scripts/ics-fixtures.ts) must come out identical here. One dynamic test per
 * case. Never edit the expectations — regenerate them on the web.
 */
class IcsFixturesTest {

    private val root: JsonObject by lazy {
        val text = checkNotNull(javaClass.getResource("/ics-fixtures.json")) {
            "ics-fixtures.json missing from src/test/resources"
        }.readText()
        PlanrJson.parseToJsonElement(text).jsonObject
    }

    private fun cases(section: String): List<JsonObject> = root.getValue(section).jsonArray.map { it.jsonObject }

    /** Parse results by case name, for the review sections that refer to them. */
    private val parsed: Map<String, Pair<String, IcsParseResult>> by lazy {
        cases("parse").associate { case ->
            val zone = case.string("viewerZone")!!
            case.string("name")!! to (zone to IcsParser.parse(case.string("text")!!, zone))
        }
    }

    private fun event(parse: String, key: String): Pair<String, IcsEvent> {
        val (zone, result) = parsed.getValue(parse)
        return zone to (result.events.firstOrNull { it.key == key } ?: fail("$parse has no event $key"))
    }

    @TestFactory
    fun parse(): List<DynamicTest> = section("parse") { case ->
        val actual = IcsParser.parse(case.string("text")!!, case.string("viewerZone")!!)
        val expected = case.getValue("result").jsonObject
        assertEquals(expected.getValue("skipped").jsonPrimitive.int, actual.skipped, "skipped")
        val expectedEvents = expected.getValue("events").jsonArray.map { it.jsonObject }
        val actualEvents = actual.events.map(::eventJson)
        val problems = buildString {
            if (expectedEvents.size != actualEvents.size) {
                appendLine("expected ${expectedEvents.size} events, got ${actualEvents.size}")
            }
            expectedEvents.zip(actualEvents).forEachIndexed { i, (e, a) ->
                if (e != a) {
                    appendLine("event #$i (${e["key"]}):")
                    for (k in (e.keys + a.keys).sorted()) {
                        if (e[k] != a[k]) appendLine("  $k: expected ${e[k]}, got ${a[k]}")
                    }
                }
            }
        }
        if (problems.isNotEmpty()) fail(problems)
    }

    @TestFactory
    fun names(): List<DynamicTest> = section("names") { case ->
        val filter = IcsReview.compileNameFilter(case.string("pattern")!!)
        val title = case.string("title")!!
        assertEquals(case.getValue("ok").jsonPrimitive.boolean, filter is NameFilter.Valid, "ok")
        assertEquals(case.getValue("match").jsonPrimitive.boolean, filter.matches(title), "match")
    }

    @TestFactory
    fun ranges(): List<DynamicTest> = section("ranges") { case ->
        val (zone, event) = event(case.string("parse")!!, case.string("key")!!)
        val range = DayRange(from = case.string("from"), to = case.string("to"))
        assertEquals(case.getValue("expected").jsonPrimitive.boolean, IcsReview.inRange(event, range, zone))
    }

    @TestFactory
    fun duplicates(): List<DynamicTest> = section("duplicates") { case ->
        val event = eventOf(case.getValue("event").jsonObject)
        val existing = case.getValue("existing").jsonArray.map { it.jsonObject }.map {
            ExistingEvent(
                icalUid = it.string("icalUid"),
                title = it.string("title")!!,
                start = it.getValue("start").jsonPrimitive.long,
                end = it.getValue("end").jsonPrimitive.long,
            )
        }
        assertEquals(case.getValue("expected").jsonPrimitive.boolean, IcsReview.isDuplicate(event, existing))
    }

    @TestFactory
    fun defaults(): List<DynamicTest> = section("defaults") { case ->
        val (_, event) = event(case.string("parse")!!, case.string("key")!!)
        val actual = IcsReview.selectedByDefault(
            event,
            duplicate = case.getValue("duplicate").jsonPrimitive.boolean,
            now = case.getValue("now").jsonPrimitive.long,
        )
        assertEquals(case.getValue("expected").jsonPrimitive.boolean, actual)
    }

    private fun section(name: String, check: (JsonObject) -> Unit): List<DynamicTest> {
        val all = cases(name)
        check(all.isNotEmpty()) { "Fixture section $name is empty" }
        return all.map { case -> dynamicTest(case.string("name") ?: name) { check(case) } }
    }

    companion object {
        private fun JsonObject.string(key: String): String? = (get(key) as? JsonPrimitive)?.contentOrNull

        private fun status(status: EventStatus): String = when (status) {
            EventStatus.Planned -> "planned"
            EventStatus.Confirmed -> "confirmed"
            EventStatus.Cancelled -> "cancelled"
        }

        /** [IcsEvent] in the fixtures' shape (parse.ts `IcsEvent`). */
        fun eventJson(e: IcsEvent): JsonObject = buildJsonObject {
            put("key", e.key)
            put("uid", e.uid)
            put("title", e.title)
            put("description", e.description)
            put("location", e.location)
            put("allDay", e.allDay)
            put("start", e.start)
            put("end", e.end)
            put("timeZone", e.timeZone)
            put("rrule", e.rrule)
            put("recurrenceEndsAt", e.recurrenceEndsAt)
            put("exdates", JsonArray(e.exdates.map { JsonPrimitive(it) }))
            put("status", status(e.status))
            put("cancelled", e.cancelled)
            put("warnings", JsonArray(e.warnings.map { JsonPrimitive(it.wire) }))
        }

        fun eventOf(json: JsonObject): IcsEvent = IcsEvent(
            key = json.string("key")!!,
            uid = json.string("uid"),
            title = json.string("title")!!,
            description = json.string("description"),
            location = json.string("location"),
            allDay = json.getValue("allDay").jsonPrimitive.boolean,
            start = json.getValue("start").jsonPrimitive.long,
            end = json.getValue("end").jsonPrimitive.long,
            timeZone = json.string("timeZone")!!,
            rrule = json.string("rrule"),
            recurrenceEndsAt = json.optionalLong("recurrenceEndsAt"),
            exdates = json.getValue("exdates").jsonArray.map { it.jsonPrimitive.long },
            status = if (json.string("status") == "planned") EventStatus.Planned else EventStatus.Confirmed,
            cancelled = json.getValue("cancelled").jsonPrimitive.boolean,
            warnings = json.getValue("warnings").jsonArray.map { IcsWarning.fromWire(it.jsonPrimitive.content)!! },
        )

        private fun JsonObject.optionalLong(key: String): Long? = get(key)?.takeIf { it !is JsonNull }?.jsonPrimitive?.longOrNull
    }
}
