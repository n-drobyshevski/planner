package page.planr.android.core.data.remote

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import page.planr.android.core.model.PlanrJson

/** Decodes a PostgREST / Realtime row with the shared lenient [PlanrJson]. */
internal fun <T> JsonObject.decodeAs(serializer: KSerializer<T>): T =
    PlanrJson.decodeFromJsonElement(serializer, this)

internal fun <T> List<JsonObject>.decodeAll(serializer: KSerializer<T>): List<T> =
    map { it.decodeAs(serializer) }

/** A string column of a raw row (e.g. `id` from a Realtime DELETE's old record). */
internal fun JsonObject.string(column: String): String? =
    (this[column] as? JsonPrimitive)?.contentOrNull
