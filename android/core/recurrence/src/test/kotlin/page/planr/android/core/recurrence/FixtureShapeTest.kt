package page.planr.android.core.recurrence

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlanrJson
import page.planr.android.core.model.TimeWindow

/**
 * Pins the contract between the TypeScript golden fixtures and :core:model:
 * every `expand` case's rows, window and expected occurrences decode with
 * [PlanrJson]. (Expansion parity itself is asserted by the port's own tests.)
 */
class FixtureShapeTest {

    private val fixtures: JsonObject by lazy {
        val text = checkNotNull(javaClass.getResource("/recurrence-fixtures.json")) {
            "recurrence-fixtures.json missing from src/test/resources"
        }.readText()
        PlanrJson.parseToJsonElement(text).jsonObject
    }

    @Test
    fun `expand fixtures decode into core model types`() {
        val cases = fixtures.getValue("expand").jsonArray
        assertTrue(cases.isNotEmpty())
        for (case in cases) {
            val input = case.jsonObject.getValue("input").jsonObject
            PlanrJson.decodeFromJsonElement(ListSerializer(PlannerEvent.serializer()), input.getValue("events"))
            PlanrJson.decodeFromJsonElement(ListSerializer(EventOverride.serializer()), input.getValue("overrides"))
            PlanrJson.decodeFromJsonElement(TimeWindow.serializer(), input.getValue("window"))
            PlanrJson.decodeFromJsonElement(
                ListSerializer(Occurrence.serializer()),
                case.jsonObject.getValue("expected"),
            )
        }
    }
}
