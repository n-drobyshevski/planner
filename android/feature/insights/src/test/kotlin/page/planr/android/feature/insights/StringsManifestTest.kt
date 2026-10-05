package page.planr.android.feature.insights

import java.io.File
import java.time.ZoneId
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.w3c.dom.Element

/**
 * The Insights strings files against their strings-source manifests
 * (src/test/resources/strings-source/<file>.json, whose web hashes the web's
 * test/insights-fixtures.test.ts checks against messages/{en,ru}). Catches,
 * before lint does: names missing from a manifest or a locale, mismatched
 * format args between en and ru (StringFormatMatches), plural items without
 * the count (ImpliedQuantity), and bare `%` (StringFormatInvalid).
 *
 * Runs with the module directory as the working directory (Gradle's default).
 */
class StringsManifestTest {

    private data class Entry(val manifest: String, val names: Map<String, Int>)

    /** A string, plural or array resource: its name and the texts that carry format args. */
    private data class Resource(val name: String, val kind: String, val texts: Map<String, String>)

    private val manifests: Map<String, List<Entry>> = FILES.associateWith { file ->
        val json = Json.parseToJsonElement(File("$SOURCES/$file.json").readText()).jsonObject
        assertEquals("strings_insights_$file.xml", json.getValue("file").jsonPrimitive.content, "$file.json file")
        json.getValue("entries").jsonArray.map { entry ->
            val obj = entry.jsonObject
            assertTrue("web" in obj && "sha" in obj, "$file.json: every entry has web and sha")
            if (obj["web"] is JsonNull) assertTrue("source" in obj, "$file.json: a null web needs a source")
            Entry(file, obj.getValue("android").jsonObject.mapValues { (_, v) -> v.jsonPrimitive.int })
        }
    }

    @Test
    fun `the test JVM runs in a hostile default zone and locale`() {
        // build.gradle.kts sets these so a leak of the device zone or locale fails a test.
        assertEquals("Pacific/Chatham", ZoneId.systemDefault().id)
        assertEquals("ru", Locale.getDefault().language)
    }

    @Test
    fun `every name is in exactly one manifest entry, and every manifest name exists in both locales`() {
        val owners = manifests.values.flatten().flatMap { entry -> entry.names.keys.map { it to entry.manifest } }
        val duplicated = owners.groupBy({ it.first }, { it.second }).filterValues { it.size > 1 }
        assertTrue(duplicated.isEmpty(), "names in more than one manifest entry: $duplicated")
        val owner = owners.toMap()

        for (file in FILES) {
            val en = resources(file, "values")
            val ru = resources(file, "values-ru")
            for (name in en.keys + ru.keys) {
                assertEquals(file, owner[name], "$name (strings_insights_$file.xml) needs an entry in $file.json")
            }
            for (name in manifests.getValue(file).flatMap { it.names.keys }) {
                assertTrue(name in en, "$name from $file.json is missing in values/")
                assertTrue(name in ru, "$name from $file.json is missing in values-ru/")
            }
        }
    }

    @Test
    fun `names carry their file's prefix`() {
        for (file in FILES) {
            val allowed = PREFIXES.getValue(file)
            for (name in resources(file, "values").keys + resources(file, "values-ru").keys) {
                assertTrue(allowed.any { name.startsWith(it) }, "$name in strings_insights_$file.xml: allowed $allowed")
            }
        }
    }

    @Test
    fun `en and ru use the same format args, as many as the manifest says`() {
        for (file in FILES) {
            val en = resources(file, "values")
            val ru = resources(file, "values-ru")
            for (entry in manifests.getValue(file)) {
                for ((name, count) in entry.names) {
                    val e = en[name] ?: continue
                    val r = ru[name] ?: continue
                    if (e.kind == "string-array") {
                        assertEquals(0, count, "$name: a string-array has no format args")
                        continue
                    }
                    val enArgs = args(e.argText())
                    assertEquals(enArgs, args(r.argText()), "$name: en and ru format args differ")
                    assertEquals(count, enArgs.size, "$name: manifest says $count format args, en has $enArgs")
                }
            }
        }
    }

    @Test
    fun `every plural item carries the count`() {
        for (file in FILES) {
            for (dir in listOf("values", "values-ru")) {
                for (res in resources(file, dir).values.filter { it.kind == "plurals" }) {
                    for ((quantity, text) in res.texts) {
                        assertTrue(COUNT.containsMatchIn(text), "$dir/${res.name} [$quantity] has no count placeholder")
                    }
                }
            }
        }
    }

    @Test
    fun `no bare percent signs`() {
        for (file in FILES) {
            for (dir in listOf("values", "values-ru")) {
                for (res in resources(file, dir).values) {
                    for (text in res.texts.values) {
                        val bare = BARE_PERCENT.find(text.replace("%%", ""))
                        if (bare != null) fail("$dir/${res.name}: bare % at \"${text.drop(bare.range.first).take(8)}\"")
                    }
                }
            }
        }
    }

    /** The text whose args count: the string itself, or a plural's `other` item. */
    private fun Resource.argText(): String = texts["other"] ?: texts.getValue("")

    /** `%n$s` / `%n$d` index → conversion; an unindexed `%s` / `%d` is index 1. */
    private fun args(text: String): Map<Int, Char> =
        ARG.findAll(text.replace("%%", "")).associate { m ->
            (m.groupValues[1].ifEmpty { "1" }.toInt()) to m.groupValues[2].single()
        }

    private fun resources(file: String, dir: String): Map<String, Resource> {
        val xml = File("$RES/$dir/strings_insights_$file.xml")
        val root = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(xml).documentElement
        val out = LinkedHashMap<String, Resource>()
        val children = root.childNodes
        for (i in 0 until children.length) {
            val el = children.item(i) as? Element ?: continue
            val name = el.getAttribute("name")
            val texts = when (el.tagName) {
                "string" -> mapOf("" to el.textContent)
                "plurals", "string-array" -> {
                    val items = el.getElementsByTagName("item")
                    (0 until items.length).associate { j ->
                        val item = items.item(j) as Element
                        (item.getAttribute("quantity").ifEmpty { "$j" }) to item.textContent
                    }
                }
                else -> continue
            }
            assertTrue(name !in out, "$dir/strings_insights_$file.xml declares $name twice")
            out[name] = Resource(name, el.tagName, texts)
        }
        return out
    }

    private companion object {
        const val RES = "src/main/res"
        const val SOURCES = "src/test/resources/strings-source"
        val FILES = listOf("shell", "common", "overview", "trends", "patterns", "tasks")

        /** Each file may only declare its own prefixes, so the merged R never collides. */
        val PREFIXES = mapOf(
            "shell" to listOf("insights_shell_", "insights_period_", "insights_filters_", "insights_tab_"),
            "common" to listOf("insights_common_"),
            "overview" to listOf("insights_overview_"),
            "trends" to listOf("insights_trends_"),
            "patterns" to listOf("insights_patterns_"),
            "tasks" to listOf("insights_tasks_"),
        )

        val ARG = Regex("""%(?:(\d+)\$)?([sd])""")
        val COUNT = Regex("""%(?:\d+\$)?d""")

        /** A `%` that does not start `%n$s`, `%n$d`, `%s` or `%d` (after removing `%%`). */
        val BARE_PERCENT = Regex("""%(?!(?:\d+\$)?[sd])""")
    }
}
