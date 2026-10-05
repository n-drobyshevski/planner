package page.planr.android.feature.insights.patterns

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.w3c.dom.Element
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.WeekdayUsage
import page.planr.android.feature.insights.R

/**
 * Every Patterns lede branch (ledes.ts `derivePatternsLede`, §B.9) maps to a
 * string in strings_insights_patterns.xml that takes exactly the spec's args,
 * in both locales; so do the daypart, context-mix and heatmap-step lookups.
 * Pure: resources are read from the XML, ids resolved through R.
 */
class PatternsTextTest {

    private val top = WeekdayUsage(weekday = 2, totalMs = 9 * HOUR, avgMs = 3.0 * HOUR, dayCount = 3)

    @Test
    fun `the headline takes the weekday and the average`() {
        val lede = assertNotNull(Ledes.patterns(top, bestDaypart = null, medianBlockMs = null))
        val spec = PatternsText.ledeSpec(lede.headline)
        assertSpec("insights_patterns_lede_headline", spec)
        assertEquals(listOf(LedeArg.Weekday(2), LedeArg.Duration(3.0 * HOUR)), spec.args)
        assertEquals(null, lede.support)
    }

    @Test
    fun `the support names the best daypart when there is one`() {
        val lede = assertNotNull(Ledes.patterns(top, Daypart.Evening, medianBlockMs = 45.0 * MINUTE))
        val spec = PatternsText.ledeSpec(assertNotNull(lede.support))
        assertSpec("insights_patterns_lede_support_daypart", spec)
        assertEquals(listOf(LedeArg.DaypartRef(Daypart.Evening)), spec.args)
    }

    @Test
    fun `otherwise the support gives the typical block`() {
        val lede = assertNotNull(Ledes.patterns(top, bestDaypart = null, medianBlockMs = 45.0 * MINUTE))
        val spec = PatternsText.ledeSpec(assertNotNull(lede.support))
        assertSpec("insights_patterns_lede_support_block", spec)
        assertEquals(listOf(LedeArg.Duration(45.0 * MINUTE)), spec.args)
    }

    @Test
    fun `another tab's key is rejected`() {
        assertFailsWith<IllegalArgumentException> { PatternsText.ledeSpec(LedeLine("lede.trendsNoneHeadline", emptyMap())) }
    }

    @Test
    fun `every daypart has a short label`() {
        val names = Daypart.entries.map { name(PatternsText.daypart(it)) }
        assertEquals(
            listOf(
                "insights_patterns_daypart_morning",
                "insights_patterns_daypart_midday",
                "insights_patterns_daypart_evening",
                "insights_patterns_daypart_night",
            ),
            names,
        )
        names.forEach { assertArgs(it, 0) }
    }

    @Test
    fun `every granularity has a context-mix title and description`() {
        for (g in Granularity.entries) {
            assertEquals("insights_patterns_context_mix_${g.id}", name(PatternsText.contextMix(g)))
            assertArgs("insights_patterns_context_mix_${g.id}", 0)
            assertEquals("insights_patterns_context_mix_aria_${g.id}", name(PatternsText.contextMixAria(g)))
            assertArgs("insights_patterns_context_mix_aria_${g.id}", 1)
        }
    }

    @Test
    fun `five heatmap steps, in order`() {
        assertEquals((0..4).map { "insights_patterns_step_$it" }, PatternsText.stepLabels.map(::name))
    }

    @Test
    fun `the weekday arrays are Monday-first sevens in both locales`() {
        for (dir in listOf("values", "values-ru")) {
            for (array in listOf("insights_patterns_weekdays_short", "insights_patterns_weekdays_full")) {
                val items = arrays(dir).getValue(array)
                assertEquals(7, items.size, "$dir/$array")
            }
        }
        assertEquals("Monday", arrays("values").getValue("insights_patterns_weekdays_full").first())
        assertEquals("Понедельник", arrays("values-ru").getValue("insights_patterns_weekdays_full").first())
    }

    private fun assertSpec(expected: String, spec: StringSpec) {
        assertEquals(expected, name(spec.id))
        assertArgs(expected, spec.args.size)
    }

    /** [name] exists in en and ru with exactly [count] format args. */
    private fun assertArgs(name: String, count: Int) {
        for (dir in listOf("values", "values-ru")) {
            val text = strings(dir)[name]
            assertNotNull(text, "$dir: $name is missing")
            val indices = ARG.findAll(text.replace("%%", "")).map { it.groupValues[1].ifEmpty { "1" }.toInt() }.toSet()
            assertEquals(count, indices.size, "$dir/$name: format args $indices")
            assertTrue(indices.isEmpty() || indices == (1..count).toSet(), "$dir/$name: args must be %1\$..%$count\$")
        }
    }

    private fun name(id: Int): String = R.string::class.java.fields.first { it.getInt(null) == id }.name

    private fun strings(dir: String): Map<String, String> = elements(dir, "string").associate { it.getAttribute("name") to it.textContent }

    private fun arrays(dir: String): Map<String, List<String>> = elements(dir, "string-array").associate { el ->
        val items = el.getElementsByTagName("item")
        el.getAttribute("name") to (0 until items.length).map { items.item(it).textContent }
    }

    private fun elements(dir: String, tag: String): List<Element> {
        val root = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File("src/main/res/$dir/strings_insights_patterns.xml")).documentElement
        val nodes = root.getElementsByTagName(tag)
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }

    private companion object {
        const val MINUTE = 60_000L
        const val HOUR = 60 * MINUTE
        val ARG = Regex("""%(?:(\d+)\$)?[sd]""")
    }
}
