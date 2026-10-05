package page.planr.android.core.recurrence

import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlanrJson
import page.planr.android.core.model.TimeWindow

/**
 * Golden parity with the web: every case in recurrence-fixtures.json (exported
 * from the real lib/recurrence code by scripts/export-recurrence-fixtures.ts)
 * must come out identical here. One dynamic test per case; failures print a
 * per-field diff. Never edit the expectations — regenerate them on the web.
 */
class RecurrenceFixturesTest {

    @TestFactory
    fun expand(): List<DynamicTest> = section("expand") { case ->
        val input = case.getValue("input").jsonObject
        val events = PlanrJson.decodeFromJsonElement(ListSerializer(PlannerEvent.serializer()), input.getValue("events"))
        val overrides = PlanrJson.decodeFromJsonElement(
            ListSerializer(EventOverride.serializer()),
            input.getValue("overrides"),
        )
        val window = PlanrJson.decodeFromJsonElement(TimeWindow.serializer(), input.getValue("window"))
        val shared = PlanrJson.decodeFromJsonElement(ListSerializer(String.serializer()), input.getValue("sharedCategoryIds"))
        val expected = PlanrJson.decodeFromJsonElement(ListSerializer(Occurrence.serializer()), case.getValue("expected"))

        val actual = DefaultRecurrenceExpander.expand(events, overrides, window, sharedCategoryIds = shared.toSet())

        if (actual != expected) fail(occurrenceDiff(expected, actual))
    }

    @TestFactory
    fun overrideInputs(): List<DynamicTest> = section("overrideInputs") { case ->
        val input = case.getValue("input").jsonObject
        val eventId = input.getValue("eventId").jsonPrimitive.content
        val occurrenceDate = FixtureJson.instant(input.getValue("occurrenceDate"))
        val result = when (val op = input.getValue("op").jsonPrimitive.content) {
            "cancel" -> EditSemantics.cancelOccurrence(eventId, occurrenceDate)
            "modify" -> EditSemantics.modifyOccurrence(
                eventId,
                occurrenceDate,
                FixtureJson.patch(input.getValue("patch").jsonObject),
            )
            else -> error("Unknown op $op")
        }
        assertJson(case.getValue("expected").jsonObject, FixtureJson.overrideInputJson(result))
    }

    @TestFactory
    fun editAll(): List<DynamicTest> = section("editAll") { case ->
        val input = case.getValue("input").jsonObject
        val result = EditSemantics.editAll(event(input), FixtureJson.patch(input.getValue("patch").jsonObject))
        assertJson(case.getValue("expected").jsonObject, FixtureJson.patchJson(result))
    }

    @TestFactory
    fun splitThisAndFuture(): List<DynamicTest> = section("splitThisAndFuture") { case ->
        val input = case.getValue("input").jsonObject
        val split = EditSemantics.splitThisAndFuture(
            event(input),
            FixtureJson.instant(input.getValue("fromOccurrence")),
            FixtureJson.patch(input.getValue("patch").jsonObject),
        )
        val expected = case.getValue("expected").jsonObject
        assertJson(expected.getValue("original").jsonObject, FixtureJson.seriesEndJson(split.original), "original")
        assertJson(expected.getValue("newSeries").jsonObject, FixtureJson.draftJson(split.newSeries), "newSeries")
    }

    @TestFactory
    fun capThisAndFuture(): List<DynamicTest> = section("capThisAndFuture") { case ->
        val input = case.getValue("input").jsonObject
        val cap = EditSemantics.capThisAndFuture(event(input), FixtureJson.instant(input.getValue("fromOccurrence")))
        // The web's deleteThisAndFuture writes only { rrule, recurrenceEndsAt }.
        val actual = JsonObject(FixtureJson.seriesEndJson(cap).filterKeys { it != "id" })
        assertJson(case.getValue("expected").jsonObject, actual)
    }

    @TestFactory
    fun buildRRule(): List<DynamicTest> = section("buildRRule") { case ->
        val form = FixtureJson.form(case.getValue("input"))
        assertEquals(case.getValue("expected").stringOrNull(), RRuleBuild.buildRRule(form))
    }

    @TestFactory
    fun parseRRule(): List<DynamicTest> = section("parseRRule") { case ->
        val form = RRuleBuild.parseRRule(case.getValue("input").stringOrNull())
        assertEquals(case.getValue("expected"), FixtureJson.formJson(form))
    }

    // --- helpers ---------------------------------------------------------------

    private fun section(name: String, check: (JsonObject) -> Unit): List<DynamicTest> {
        val cases = FixtureJson.cases(name)
        assertTrue(cases.isNotEmpty(), "fixture section '$name' is empty")
        return cases.map { case ->
            val caseName = case.getValue("name").jsonPrimitive.content
            dynamicTest("$name / $caseName") { check(case) }
        }
    }

    private fun event(input: JsonObject): PlannerEvent =
        PlanrJson.decodeFromJsonElement(PlannerEvent.serializer(), input.getValue("event"))

    private fun JsonElement.stringOrNull(): String? = if (this is JsonNull) null else (this as JsonPrimitive).contentOrNull

    private fun assertJson(expected: JsonObject, actual: JsonObject, label: String = "result") {
        if (expected != actual) fail("$label differs:\n" + FixtureJson.diff(expected, actual))
    }

    private fun occurrenceDiff(expected: List<Occurrence>, actual: List<Occurrence>): String = buildString {
        appendLine("expected ${expected.size} occurrence(s), got ${actual.size}")
        val serializer = Occurrence.serializer()
        for (i in 0 until maxOf(expected.size, actual.size)) {
            val e = expected.getOrNull(i)
            val a = actual.getOrNull(i)
            if (e == a) continue
            appendLine("[$i] ${e?.key ?: "<none>"} vs ${a?.key ?: "<none>"}")
            when {
                e == null -> appendLine("  unexpected: ${PlanrJson.encodeToJsonElement(serializer, a!!)}")
                a == null -> appendLine("  missing: ${PlanrJson.encodeToJsonElement(serializer, e)}")
                else -> append(
                    FixtureJson.diff(
                        PlanrJson.encodeToJsonElement(serializer, e).jsonObject,
                        PlanrJson.encodeToJsonElement(serializer, a).jsonObject,
                        indent = "    ",
                    ),
                )
            }
        }
    }
}
