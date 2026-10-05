package page.planr.android.feature.insights.overview

import java.io.File
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import org.w3c.dom.Element
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.TopContext
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.TotalTrend
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.UiText

/**
 * Every Overview lede branch and label maps to an existing resource with the
 * right number of format args, checked without a Context: resource ids are
 * named through `R.string`, their texts read from the strings XML. The en
 * renderings pin the frame + clause composition.
 */
class OverviewTextTest {

    private val en = Strings("values")
    private val ru = Strings("values-ru")

    @Test
    fun `every headline direction and unit maps to a resource with its arg count`() {
        val cases = mapOf(
            // total, previous total → direction
            "up" to (5 * HOUR to 4 * HOUR),
            "down" to (3 * HOUR to 4 * HOUR),
            "level" to (4 * HOUR to 4 * HOUR),
            "none" to (4 * HOUR to 0L),
        )
        val units = mapOf("week" to PeriodPreset.ThisWeek, "month" to PeriodPreset.ThisMonth, "period" to PeriodPreset.Last30d)
        for ((direction, totals) in cases) {
            for ((unit, preset) in units) {
                val line = Ledes.overview(totals.first, totals.second, preset, null)!!.headline
                assertEquals(direction, (line.args.getValue("direction") as LedeArg.Select).token)
                val spec = ledeSpec(line, LabelLocale.En, ::fail)
                assertArity(spec)
                val clause = (spec as UiText.Res).args[1]
                when (direction) {
                    "none" -> assertEquals(UiText.Raw(""), clause)
                    else -> assertEquals("insights_overview_lede_${direction}_$unit", name((clause as UiText.Res).id))
                }
            }
        }
    }

    @Test
    fun `headlines compose frame and clause like the ICU message`() {
        fun headline(total: Long, prev: Long, preset: PeriodPreset) =
            en.render(ledeSpec(Ledes.overview(total, prev, preset, null)!!.headline, LabelLocale.En, ::fail))

        assertEquals("You tracked 5h, up 25% (1h) vs the previous week.", headline(5 * HOUR, 4 * HOUR, PeriodPreset.LastWeek))
        assertEquals(
            "You tracked 3h, down 25% (1h) vs the previous month.",
            headline(3 * HOUR, 4 * HOUR, PeriodPreset.ThisMonth),
        )
        assertEquals("You tracked 4h, level with the previous period.", headline(4 * HOUR, 4 * HOUR, PeriodPreset.Last7d))
        assertEquals("You tracked 4h.", headline(4 * HOUR, 0, PeriodPreset.Custom))
        assertEquals(
            "Учтено 2 ч 30 мин, рост на 25% (30 мин) к предыдущей неделе.",
            ru.render(ledeSpec(Ledes.overview(150 * MINUTE, 2 * HOUR, PeriodPreset.ThisWeek, null)!!.headline, LabelLocale.Ru, ::fail)),
        )
    }

    @Test
    fun `the support line names the top context through the caller`() {
        val lede = Ledes.overview(4 * HOUR, 0, PeriodPreset.ThisWeek, TopContext("cat-work", 3 * HOUR))!!
        val support = assertNotNull(lede.support)
        val spec = ledeSpec(support, LabelLocale.En) { key -> "name of $key" }
        assertArity(spec)
        assertEquals("Most of it went to name of cat-work (75%).", en.render(spec))
    }

    @Test
    fun `a line from another tab is rejected`() {
        assertFailsWith<IllegalArgumentException> { ledeSpec(LedeLine("lede.trendsNoneHeadline", emptyMap()), LabelLocale.En, ::fail) }
    }

    @Test
    fun `per-day headline has one resource per trend`() {
        val rendered = TotalTrend.entries.associateWith { trend ->
            val spec = perDayHeadline(TotalChange(trend, 12), "3h")
            assertArity(spec)
            en.render(spec)
        }
        assertEquals(
            mapOf(
                TotalTrend.None to "3h tracked this period.",
                TotalTrend.Level to "3h tracked, level with the previous period.",
                TotalTrend.Up to "3h tracked, up 12% vs the previous period.",
                TotalTrend.Down to "3h tracked, down 12% vs the previous period.",
            ),
            rendered,
        )
    }

    @Test
    fun `the footnote names the typical day only when there is one`() {
        val typical = perDayFootnote(90.0 * MINUTE, LabelLocale.En)
        assertArity(typical)
        assertEquals(
            "Dashed line: typical day (1h 30m) · curve: trailing 7-day average · tap a day for detail",
            en.render(typical),
        )
        assertEquals("insights_overview_per_day_footnote", name((perDayFootnote(0.0, LabelLocale.En) as UiText.Res).id))
    }

    @Test
    fun `the chart description is the aria label then the screen-reader summary`() {
        val parts = perDayDescription("This week · 28 Sep – 4 Oct 2026", "31h", "Thursday 1 October" to "7h", "Work")
        parts.forEach(::assertArity)
        assertEquals(
            listOf(
                "Tracked time per day, This week · 28 Sep – 4 Oct 2026",
                "31h tracked in This week · 28 Sep – 4 Oct 2026.",
                " Busiest day Thursday 1 October with 7h.",
                " Most time went to Work.",
            ),
            parts.map(en::render),
        )
        assertEquals(2, perDayDescription("p", "0m", null, null).size)
    }

    @Test
    fun `stat values and hints`() {
        assertEquals("—", onTimeValue(null))
        // Math.round semantics, half up (half-even would give 82 and 12).
        assertEquals("83%", onTimeValue(0.825))
        assertEquals("13%", onTimeValue(0.125))
        assertEquals("100%", onTimeValue(1.0))
        assertArity(onTimeHint(3))
        assertEquals("3 due", en.render(onTimeHint(3)))
        assertEquals("nothing due", en.render(onTimeHint(0)))
        assertEquals("0%", percentText(5, 0))
        assertEquals("33%", percentText(1, 3))
    }

    @Test
    fun `shift chips carry a glyph, the points and a spoken direction`() {
        val (up, upFigure) = shiftFigure(13)
        assertEquals("▲ ", up)
        assertEquals("13 pts", en.render(upFigure))
        val (down, downFigure) = shiftFigure(-7)
        assertEquals("▼ ", down)
        assertEquals("7 п.", ru.render(downFigure))
        assertArity(shiftSpoken("Work", -7))
        assertEquals("Work: share up 13 points vs previous period", en.render(shiftSpoken("Work", 13)))
        assertEquals("Work: share down 7 points vs previous period", en.render(shiftSpoken("Work", -7)))
    }

    /** [spec] and every nested [UiText] name a resource whose en and ru texts take exactly its args. */
    private fun assertArity(spec: UiText) {
        if (spec !is UiText.Res) return
        val name = name(spec.id)
        assertEquals(spec.args.size, en.arity(name), "$name (en) arg count")
        assertEquals(spec.args.size, ru.arity(name), "$name (ru) arg count")
        spec.args.filterIsInstance<UiText>().forEach(::assertArity)
    }

    private fun fail(key: String): String = throw AssertionError("no category name expected, got $key")

    private companion object {
        const val MINUTE = 60_000L
        const val HOUR = 60 * MINUTE

        /** R.string field names by id. */
        val names: Map<Int, String> = R.string::class.java.fields.associate { it.getInt(null) to it.name }

        fun name(id: Int): String = assertNotNull(names[id], "no R.string for $id")
    }

    /** The overview strings of one values folder, rendered the way Resources.getString formats them. */
    private class Strings(folder: String) {
        private val texts: Map<String, String> = run {
            val file = File("src/main/res/$folder/strings_insights_overview.xml")
            val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
            val nodes = doc.getElementsByTagName("string")
            (0 until nodes.length).associate { i ->
                val e = nodes.item(i) as Element
                e.getAttribute("name") to unescape(e.textContent)
            }
        }

        fun arity(name: String): Int =
            ARG.findAll(text(name)).map { it.groupValues[1] }.toSet().size

        fun render(spec: UiText): String = when (spec) {
            is UiText.Res -> String.format(
                Locale.ROOT,
                text(name(spec.id)),
                *spec.args.map { if (it is UiText) render(it) else it }.toTypedArray(),
            )
            is UiText.Raw -> spec.text
            is UiText.Plural -> error("Overview has no plurals")
        }

        private fun text(name: String): String = assertNotNull(texts[name], "$name missing")

        private fun unescape(raw: String): String {
            val quoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
            return (if (quoted) raw.substring(1, raw.length - 1) else raw).replace("\\'", "'")
        }

        private companion object {
            val ARG = Regex("""%(\d+)\$[sd]""")
        }
    }
}
