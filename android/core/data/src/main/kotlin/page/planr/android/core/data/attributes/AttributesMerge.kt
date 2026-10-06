package page.planr.android.core.data.attributes

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * The known optimization attributes of an event or task and the values each
 * may take (`ATTRIBUTE_KEYS` / `valueSchemas` in lib/attributes/schema.ts).
 * Options are kept in their string form ("1", "fixed"); [numeric] scales are
 * stored as JSON numbers.
 */
enum class AttributeKey(val key: String, val options: List<String>, val numeric: Boolean) {
    /** How demanding the item is, 1–4. */
    Energy("energy", listOf("1", "2", "3", "4"), numeric = true),

    /** How movable it is when a day overloads. */
    Flexibility("flexibility", listOf("fixed", "movable", "flexible"), numeric = false),

    /** The concentration mode it needs. */
    Focus("focus", listOf("deep", "shallow"), numeric = false),

    /** Retrospective 1–4 rating. */
    Satisfaction("satisfaction", listOf("1", "2", "3", "4"), numeric = true),
    ;

    /** [option] as the JSON value stored under [key]. */
    internal fun encode(option: String): JsonPrimitive =
        if (numeric) JsonPrimitive(option.toInt()) else JsonPrimitive(option)

    /** The option a stored value stands for, or null when it isn't a valid one. */
    internal fun decode(value: JsonElement?): String? {
        val primitive = value as? JsonPrimitive ?: return null
        val option = when {
            numeric -> primitive.takeUnless { it.isString }?.intOrNull?.toString()
            else -> primitive.takeIf { it.isString }?.content
        }
        return option?.takeIf { it in options }
    }

    companion object {
        /** The known attribute stored under [key], or null for one this build doesn't know. */
        fun of(key: String): AttributeKey? = entries.firstOrNull { it.key == key }
    }
}

/**
 * Edits to the `attributes` jsonb bag that never lose data the editor doesn't
 * know about: an imported event's `icalUid` and keys written by newer clients
 * survive every save (`setAttribute` / `parseAttributes` on the web).
 */
object AttributesMerge {

    /**
     * The known attributes [attributes] sets, as option strings. Lenient like
     * `parseAttributes`: a junk value reads as unset.
     */
    fun known(attributes: JsonObject): Map<AttributeKey, String> =
        AttributeKey.entries.mapNotNull { key -> key.decode(attributes[key.key])?.let { key to it } }.toMap()

    /** [selection] with [key] set to [option], or cleared when it is null. */
    fun select(selection: Map<AttributeKey, String>, key: AttributeKey, option: String?): Map<AttributeKey, String> =
        if (option == null) selection - key else selection + (key to option)

    /**
     * The known keys whose selection differs between [before] and [after]:
     * the new option, or null where it was cleared.
     */
    fun edits(before: Map<AttributeKey, String>, after: Map<AttributeKey, String>): Map<AttributeKey, String?> =
        AttributeKey.entries.filter { before[it] != after[it] }.associateWith { after[it] }

    /**
     * [existing] with each of [edits] applied: a value sets its key, null
     * deletes only that key (clear = absent, never null). Every other key,
     * known or not, is kept as it was. Invalid options are ignored.
     */
    fun merge(existing: JsonObject, edits: Map<AttributeKey, String?>): JsonObject {
        if (edits.isEmpty()) return existing
        val next = LinkedHashMap(existing)
        for ((key, option) in edits) {
            when {
                option == null -> next.remove(key.key)
                option in key.options -> next[key.key] = key.encode(option)
            }
        }
        return JsonObject(next)
    }

    /** [existing] showing [selected] for the known keys, touching only the ones that changed. */
    fun apply(existing: JsonObject, selected: Map<AttributeKey, String>): JsonObject =
        merge(existing, edits(known(existing), selected))
}
