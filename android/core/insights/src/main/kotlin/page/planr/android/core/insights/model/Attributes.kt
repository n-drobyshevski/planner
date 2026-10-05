package page.planr.android.core.insights.model

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

enum class Focus(val wire: String) { Deep("deep"), Shallow("shallow") }

enum class Flexibility(val wire: String) { Fixed("fixed"), Movable("movable"), Flexible("flexible") }

/**
 * The optimization attributes analytics reads, parsed leniently like the web's
 * `parseAttributes` (lib/attributes/schema.ts): a broken key is dropped on its
 * own, unknown keys are ignored.
 */
data class Attributes(
    /** 1..4 */
    val energy: Int? = null,
    val flexibility: Flexibility? = null,
    val focus: Focus? = null,
    /** 1..4 */
    val satisfaction: Int? = null,
) {
    companion object {
        val None = Attributes()

        /**
         * Non-object → [None]. energy / satisfaction must be JSON numbers equal to
         * 1, 2, 3 or 4 (zod `z.literal`: `1` and `1.0` pass; `"1"`, `true`, `1.5`
         * do not); focus / flexibility must be strings in their enum.
         */
        fun parse(json: JsonElement?): Attributes {
            val obj = json as? JsonObject ?: return None
            return Attributes(
                energy = rating(obj["energy"]),
                flexibility = enumOf(obj["flexibility"], Flexibility.entries) { it.wire },
                focus = enumOf(obj["focus"], Focus.entries) { it.wire },
                satisfaction = rating(obj["satisfaction"]),
            )
        }

        private fun rating(value: JsonElement?): Int? {
            val primitive = value as? JsonPrimitive ?: return null
            if (primitive.isString) return null
            val number = primitive.content.toDoubleOrNull() ?: return null
            return when (number) {
                1.0 -> 1
                2.0 -> 2
                3.0 -> 3
                4.0 -> 4
                else -> null
            }
        }

        private fun <E> enumOf(value: JsonElement?, entries: List<E>, wire: (E) -> String): E? {
            val primitive = value as? JsonPrimitive ?: return null
            if (!primitive.isString) return null
            return entries.firstOrNull { wire(it) == primitive.content }
        }
    }
}
