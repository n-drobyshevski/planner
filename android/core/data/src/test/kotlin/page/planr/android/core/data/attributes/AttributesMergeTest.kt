package page.planr.android.core.data.attributes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

class AttributesMergeTest {
    private val stored = buildJsonObject {
        put("icalUid", "abc@example.com")
        put("energy", 3)
        put("focus", "deep")
        putJsonObject("future") { put("x", 1) }
    }

    @Test
    fun `known reads valid values as options and skips junk`() {
        val attrs = buildJsonObject {
            put("energy", 2)
            put("flexibility", "sometimes")
            put("focus", JsonNull)
            put("satisfaction", "4")
            put("icalUid", "u")
        }
        assertEquals(mapOf(AttributeKey.Energy to "2"), AttributesMerge.known(attrs))
        assertEquals(mapOf(AttributeKey.Energy to "3", AttributeKey.Focus to "deep"), AttributesMerge.known(stored))
    }

    @Test
    fun `merge sets edited keys and keeps icalUid and unknown keys`() {
        val merged = AttributesMerge.merge(stored, mapOf(AttributeKey.Energy to "4", AttributeKey.Flexibility to "movable"))

        assertEquals(JsonPrimitive(4), merged["energy"], "numeric scales stay JSON numbers")
        assertEquals(JsonPrimitive("movable"), merged["flexibility"])
        assertEquals(stored["icalUid"], merged["icalUid"])
        assertEquals(stored["future"], merged["future"])
        assertEquals(JsonPrimitive("deep"), merged["focus"])
    }

    @Test
    fun `clearing a value deletes only that key`() {
        val merged = AttributesMerge.merge(stored, mapOf(AttributeKey.Focus to null))

        assertEquals(setOf("icalUid", "energy", "future"), merged.keys)
    }

    @Test
    fun `invalid options are ignored`() {
        val merged = AttributesMerge.merge(stored, mapOf(AttributeKey.Energy to "9"))
        assertEquals(stored, merged)
    }

    @Test
    fun `edits lists only the keys whose selection changed`() {
        val before = mapOf(AttributeKey.Energy to "3", AttributeKey.Focus to "deep")
        val after = mapOf(AttributeKey.Energy to "3", AttributeKey.Satisfaction to "2")

        assertEquals(
            mapOf(AttributeKey.Focus to null, AttributeKey.Satisfaction to "2"),
            AttributesMerge.edits(before, after),
        )
    }

    @Test
    fun `apply leaves an untouched bag as it is, junk included`() {
        val withJunk = buildJsonObject {
            put("energy", "high")
            put("icalUid", "u")
        }
        assertSame(withJunk, AttributesMerge.apply(withJunk, emptyMap()))
        assertEquals(
            buildJsonObject {
                put("energy", "high")
                put("icalUid", "u")
                put("satisfaction", 1)
            },
            AttributesMerge.apply(withJunk, mapOf(AttributeKey.Satisfaction to "1")),
        )
    }

    @Test
    fun `apply on an empty bag writes just the selection`() {
        assertEquals(
            buildJsonObject { put("focus", "shallow") },
            AttributesMerge.apply(JsonObject(emptyMap()), mapOf(AttributeKey.Focus to "shallow")),
        )
    }
}
