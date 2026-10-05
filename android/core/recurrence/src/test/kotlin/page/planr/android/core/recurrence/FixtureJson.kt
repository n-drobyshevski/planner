package page.planr.android.core.recurrence

import kotlin.time.Instant
import kotlinx.datetime.DayOfWeek
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.model.PlanrJson

/**
 * Reading and writing the golden fixtures' non-row shapes (patches, forms,
 * splits) — the JSON schema documented in scripts/recurrence-fixtures.ts.
 * Outputs are rebuilt in the fixtures' own shape so cases compare as plain
 * [JsonObject]s (key order irrelevant, as the schema says).
 */
internal object FixtureJson {

    val root: JsonObject by lazy {
        val text = checkNotNull(FixtureJson::class.java.getResource("/recurrence-fixtures.json")) {
            "recurrence-fixtures.json missing from src/test/resources"
        }.readText()
        PlanrJson.parseToJsonElement(text).jsonObject
    }

    fun cases(section: String): List<JsonObject> = root.getValue(section).jsonArray.map { it.jsonObject }

    // --- Instants ------------------------------------------------------------

    /** JS `toISOString()`: always milliseconds, always `Z`. */
    fun iso(instant: Instant): String {
        val ms = instant.toEpochMilliseconds()
        val whole = Instant.fromEpochMilliseconds(ms - Math.floorMod(ms, 1000L)).toString().removeSuffix("Z")
        return "$whole.${Math.floorMod(ms, 1000L).toString().padStart(3, '0')}Z"
    }

    fun instant(element: JsonElement): Instant = Instant.parse(element.jsonPrimitive.content)

    private fun JsonObject.string(key: String): String? = get(key)?.jsonPrimitive?.contentOrNull

    // --- OccurrencePatch -------------------------------------------------------

    fun patch(json: JsonObject): OccurrencePatch = OccurrencePatch(
        title = json.string("title"),
        description = json.patchField("description"),
        location = json.patchField("location"),
        categoryId = json.patchField("categoryId"),
        start = json["start"]?.let(::instant),
        end = json["end"]?.let(::instant),
        allDay = json["allDay"]?.jsonPrimitive?.booleanOrNull,
        inactive = json["inactive"]?.jsonPrimitive?.booleanOrNull,
        status = json["status"]?.let { PlanrJson.decodeFromJsonElement(EventStatus.serializer(), it) },
    )

    private fun JsonObject.patchField(key: String): PatchField<String?> =
        if (containsKey(key)) PatchField.Value(string(key)) else PatchField.Unchanged

    fun patchJson(patch: OccurrencePatch): JsonObject = buildJsonObject {
        patch.title?.let { put("title", it) }
        patch.description.let { if (it is PatchField.Value) put("description", it.value) }
        patch.location.let { if (it is PatchField.Value) put("location", it.value) }
        patch.categoryId.let { if (it is PatchField.Value) put("categoryId", it.value) }
        patch.start?.let { put("start", iso(it)) }
        patch.end?.let { put("end", iso(it)) }
        patch.allDay?.let { put("allDay", it) }
        patch.inactive?.let { put("inactive", it) }
        patch.status?.let { put("status", PlanrJson.encodeToJsonElement(EventStatus.serializer(), it)) }
    }

    // --- Edit semantics outputs ------------------------------------------------

    fun overrideInputJson(input: OverrideInput): JsonObject = buildJsonObject {
        put("eventId", input.eventId)
        put("occurrenceDate", iso(input.occurrenceDate))
        put("type", PlanrJson.encodeToJsonElement(OverrideType.serializer(), input.type))
        input.patch?.let { put("patch", patchJson(it)) }
    }

    fun seriesEndJson(end: SeriesEnd): JsonObject = buildJsonObject {
        put("id", end.id)
        put("rrule", end.rrule)
        put("recurrenceEndsAt", end.recurrenceEndsAt?.let(::iso))
    }

    fun draftJson(draft: PlannerEventDraft): JsonObject = buildJsonObject {
        put("workspaceId", draft.workspaceId)
        put("ownerId", draft.ownerId)
        put("categoryId", draft.categoryId)
        put("title", draft.title)
        put("description", draft.description)
        put("location", draft.location)
        put("isPrivate", draft.isPrivate)
        put("isShared", draft.isShared)
        put("hiddenFromPublic", draft.hiddenFromPublic)
        put("color", draft.color)
        put("kind", PlanrJson.encodeToJsonElement(EventKind.serializer(), draft.kind))
        put("allDay", draft.allDay)
        put("inactive", draft.inactive)
        put("status", PlanrJson.encodeToJsonElement(EventStatus.serializer(), draft.status))
        put("start", iso(draft.start))
        put("end", iso(draft.end))
        put("timeZone", draft.timeZone)
        put("rrule", draft.rrule)
        put("recurrenceEndsAt", draft.recurrenceEndsAt?.let(::iso))
        put("taskId", draft.taskId)
        put("attributes", draft.attributes)
    }

    // --- RecurrenceForm ----------------------------------------------------------

    fun form(element: JsonElement): RecurrenceForm? {
        if (element is JsonNull) return null
        val json = element.jsonObject
        val end = json.getValue("end").jsonObject
        return RecurrenceForm(
            freq = Freq.valueOf(json.getValue("freq").jsonPrimitive.content),
            interval = json.getValue("interval").jsonPrimitive.int,
            byWeekday = json.getValue("byWeekday").jsonArray.mapTo(mutableSetOf()) { DayOfWeek.entries[it.jsonPrimitive.int] },
            end = when (val type = end.getValue("type").jsonPrimitive.content) {
                "never" -> RecurrenceEnd.Never
                "until" -> RecurrenceEnd.Until(instant(end.getValue("date")))
                "count" -> RecurrenceEnd.Count(end.getValue("count").jsonPrimitive.int)
                else -> error("Unknown end type $type")
            },
        )
    }

    fun formJson(form: RecurrenceForm?): JsonElement {
        if (form == null) return JsonNull
        return buildJsonObject {
            put("freq", form.freq.name)
            put("interval", form.interval)
            put("byWeekday", JsonArray(form.byWeekday.map { it.ordinal }.sorted().map(::JsonPrimitive)))
            put(
                "end",
                when (val end = form.end) {
                    RecurrenceEnd.Never -> buildJsonObject { put("type", "never") }
                    is RecurrenceEnd.Until -> buildJsonObject {
                        put("type", "until")
                        put("date", iso(end.date))
                    }
                    is RecurrenceEnd.Count -> buildJsonObject {
                        put("type", "count")
                        put("count", end.count)
                    }
                },
            )
        }
    }

    /** Key-by-key differences between two JSON objects, for failure messages. */
    fun diff(expected: JsonObject, actual: JsonObject, indent: String = "  "): String = buildString {
        for (key in (expected.keys + actual.keys).sorted()) {
            val e = expected[key]
            val a = actual[key]
            if (e != a) appendLine("$indent$key: expected ${e ?: "<absent>"}, got ${a ?: "<absent>"}")
        }
    }
}
