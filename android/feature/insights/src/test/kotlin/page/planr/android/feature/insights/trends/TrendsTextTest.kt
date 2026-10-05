package page.planr.android.feature.insights.trends

import java.io.File
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.w3c.dom.Element
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.model.AnomalyDirection
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.TrendKind
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.UiText

/**
 * [TrendsText] without a Context: every lede key / token branch that
 * Ledes.trends can produce maps to an existing Trends string with as many
 * args as it has format args, and renders the web's sentence in en and ru.
 * Strings are read from the module's XML (the unit-test working directory).
 */
class TrendsTextTest {

    private val en = Strings.load("values")
    private val ru = Strings.load("values-ru")

    @Test
    fun `every lede branch maps to a Trends resource with matching args`() {
        val keys = mutableSetOf<String>()
        val clauses = mutableSetOf<String>()
        for (g in Granularity.entries) {
            for (direction in listOf(null) + TrendKind.entries) {
                for (slope in listOf(null, 0.0, -90_000.0, 20_000.0, 2.5 * HOUR)) {
                    for (busiest in listOf(null, week)) {
                        val lede = Ledes.trends(TrendDirection(slope, direction), g, busiest)
                        for (line in listOfNotNull(lede.headline, lede.support)) {
                            keys += line.key
                            val spec = TrendsText.ledeSpec(line, BERLIN, LabelLocale.En)
                            checkArgs(spec, line)
                            clauses += nestedNames(spec)
                        }
                    }
                }
            }
        }
        assertEquals(
            setOf("lede.trendsNoneHeadline", "lede.trendsNoneSupport", "lede.trendsHeadline", "lede.trendsSupport"),
            keys,
        )
        // Every per-granularity rate clause is reached.
        assertEquals(Granularity.entries.map { nameOf(TrendsText.rateClause(it)) }.toSet(), clauses)
    }

    @Test
    fun `the headline is the web sentence, with the rate clause only when there is a rate`() {
        assertEquals(
            "Your tracked time is trending up, about +2h 30m per week.",
            headline(TrendDirection(2.5 * HOUR, TrendKind.Up), Granularity.Week, en),
        )
        assertEquals(
            "Your tracked time is trending down, about −45m per day.",
            headline(TrendDirection(-0.75 * HOUR, TrendKind.Down), Granularity.Day, en),
        )
        assertEquals(
            "Your tracked time is holding steady across the period.",
            headline(TrendDirection(0.0, TrendKind.Flat), Granularity.Month, en),
        )
        // No slope: no clause (hasRate = no).
        assertEquals("Your tracked time is trending up.", headline(TrendDirection(null, TrendKind.Up), Granularity.Day, en))
        // A rate under half a minute rounds to 0m, as on the web.
        assertEquals(
            "Your tracked time is trending down, about −0m per month.",
            headline(TrendDirection(-20_000.0, TrendKind.Down), Granularity.Month, en),
        )
        assertEquals(
            "Учтённое время растёт, примерно +2 ч 30 мин в неделю.",
            headline(TrendDirection(2.5 * HOUR, TrendKind.Up), Granularity.Week, ru),
        )
        assertEquals(
            "Учтённое время снижается, примерно −45 мин в месяц.",
            headline(TrendDirection(-0.75 * HOUR, TrendKind.Down), Granularity.Month, ru),
        )
        assertEquals(
            "Учтённое время держится ровно на протяжении периода.",
            headline(TrendDirection(0.0, TrendKind.Flat), Granularity.Day, ru),
        )
    }

    @Test
    fun `without a direction the lede says there is not enough history`() {
        val lede = Ledes.trends(TrendDirection(null, null), Granularity.Week, week)
        assertEquals("Not enough history yet to call a trend.", render(TrendsText.ledeSpec(lede.headline, BERLIN, LabelLocale.En), en))
        assertEquals(
            "Продолжай отслеживать — направление появится здесь.",
            render(TrendsText.ledeSpec(checkNotNull(lede.support), BERLIN, LabelLocale.Ru), ru),
        )
    }

    @Test
    fun `the support line names the busiest bucket with its label and duration`() {
        val lede = Ledes.trends(TrendDirection(HOUR.toDouble(), TrendKind.Up), Granularity.Week, week)
        val support = checkNotNull(lede.support)
        assertEquals("Busiest week: 1 – 7 Jun 2026 (5h).", render(TrendsText.ledeSpec(support, BERLIN, LabelLocale.En), en))
        assertEquals(
            "Самая загруженная неделя: 1 – 7 июн. 2026 (5 ч).",
            render(TrendsText.ledeSpec(support, BERLIN, LabelLocale.Ru), ru),
        )
    }

    @Test
    fun `other tabs' lede keys are rejected`() {
        assertFailsWith<IllegalStateException> {
            TrendsText.ledeSpec(LedeLine("lede.tasksDoneHeadline", emptyMap()), BERLIN, LabelLocale.En)
        }
    }

    @Test
    fun `the per-granularity picks name their own granularity's string`() {
        val picks: List<Pair<(Granularity) -> Int, Int>> = listOf(
            TrendsText::perBucketTitle to 0,
            TrendsText::perBucketHeadline to 3,
            TrendsText::perBucketAria to 1,
            TrendsText::busiest to 0,
            TrendsText::srSummary to 4,
            TrendsText::byContextAria to 1,
            TrendsText::rateClause to 2,
            TrendsText::support to 2,
        )
        for ((pick, args) in picks) {
            for (g in Granularity.entries) {
                val name = nameOf(pick(g))
                assertTrue(name.endsWith("_${g.id}"), "$name for $g")
                assertEquals(args, argCount(en.strings.getValue(name)), "$name format args")
                assertEquals(args, argCount(ru.strings.getValue(name)), "$name format args (ru)")
            }
        }
        assertEquals(3, argCount(en.strings.getValue("insights_trends_by_context_headline")))
    }

    @Test
    fun `the per-bucket headline keeps the trend clause's leading space`() {
        val clause = en.strings.getValue(nameOf(checkNotNull(TrendsText.trendClause(TrendKind.Up))))
        assertEquals(
            "Busiest week: 1 – 7 Jun 2026 (5h). Trending up across the period.",
            format(en.strings.getValue(nameOf(TrendsText.perBucketHeadline(Granularity.Week))), listOf("1 – 7 Jun 2026", "5h", clause), en),
        )
        assertEquals(
            "Самый загруженный неделя: 1 – 7 июн. 2026 (5 ч). Держится ровно на протяжении периода.",
            format(
                ru.strings.getValue(nameOf(TrendsText.perBucketHeadline(Granularity.Week))),
                listOf("1 – 7 июн. 2026", "5 ч", ru.strings.getValue(nameOf(checkNotNull(TrendsText.trendClause(TrendKind.Flat))))),
                ru,
            ),
        )
        assertNull(TrendsText.trendClause(null))
    }

    @Test
    fun `momentum figures`() {
        assertNull(TrendsText.trendRate(TrendDirection(null, null), LabelLocale.En))
        assertNull(TrendsText.trendRate(TrendDirection(null, TrendKind.Up), LabelLocale.En))
        assertEquals("Level", render(checkNotNull(TrendsText.trendRate(TrendDirection(0.0, TrendKind.Flat), LabelLocale.En)), en))
        assertEquals("Ровно", render(checkNotNull(TrendsText.trendRate(TrendDirection(0.0, TrendKind.Flat), LabelLocale.Ru)), ru))
        assertEquals(
            "+1h 30m/day",
            render(checkNotNull(TrendsText.trendRate(TrendDirection(1.5 * HOUR, TrendKind.Up), LabelLocale.En)), en),
        )
        assertEquals(
            "−45 мин/день",
            render(checkNotNull(TrendsText.trendRate(TrendDirection(-0.75 * HOUR, TrendKind.Down), LabelLocale.Ru)), ru),
        )
        assertEquals("1 day", render(TrendsText.days(1), en))
        assertEquals("3 days", render(TrendsText.days(3), en))
        assertEquals("0 days", render(TrendsText.days(0), en))
        assertEquals("1 день", render(TrendsText.days(1), ru))
        assertEquals("3 дня", render(TrendsText.days(3), ru))
        assertEquals("5 дней", render(TrendsText.days(5), ru))
        assertEquals("21 день", render(TrendsText.days(21), ru))
        // Math.round, not half-even.
        assertEquals("13%", TrendsText.percent(0.125))
        assertEquals("0%", TrendsText.percent(0.0))
        assertEquals("33%", TrendsText.share(1, 3))
        assertEquals("0%", TrendsText.share(0, 0))
        assertEquals("Unusually heavy:", en.strings.getValue(nameOf(TrendsText.unusual(AnomalyDirection.High))))
        assertEquals("Необычно мало:", ru.strings.getValue(nameOf(TrendsText.unusual(AnomalyDirection.Low))))
    }

    private fun headline(trend: TrendDirection, g: Granularity, strings: Strings): String {
        val line = Ledes.trends(trend, g, week).headline
        return render(TrendsText.ledeSpec(line, BERLIN, if (strings.ru) LabelLocale.Ru else LabelLocale.En), strings)
    }

    /** Each resource text has exactly as many format args as the spec passes, nested clauses included. */
    private fun checkArgs(text: UiText, line: LedeLine) {
        val (name, args) = when (text) {
            is UiText.Res -> nameOf(text.id) to text.args
            is UiText.Plural -> error("Trends ledes use no plurals: ${line.key}")
            is UiText.Raw -> return
        }
        assertTrue(name.startsWith("insights_trends_lede_"), "${line.key} → $name")
        for (strings in listOf(en, ru)) assertEquals(argCount(strings.strings.getValue(name)), args.size, "${line.key} → $name args")
        args.filterIsInstance<UiText>().forEach { checkArgs(it, line) }
    }

    /** The names of the clause strings nested in [text]'s args. */
    private fun nestedNames(text: UiText): Set<String> =
        (text as? UiText.Res)?.args.orEmpty().filterIsInstance<UiText.Res>().map { nameOf(it.id) }.toSet()

    /** What `UiText.resolve()` renders, against the parsed XML instead of a Context. */
    private fun render(text: UiText, strings: Strings): String = when (text) {
        is UiText.Res -> format(strings.strings.getValue(nameOf(text.id)), text.args, strings)
        is UiText.Plural -> format(strings.plural(pluralNameOf(text.id), text.quantity), text.args, strings)
        is UiText.Raw -> text.text
    }

    private fun format(pattern: String, args: List<Any>, strings: Strings): String =
        String.format(Locale.ROOT, pattern, *args.map { if (it is UiText) render(it, strings) else it }.toTypedArray())

    private fun nameOf(id: Int): String =
        R.string::class.java.fields.firstOrNull { it.getInt(null) == id }?.name ?: error("no string resource $id")

    private fun pluralNameOf(id: Int): String =
        R.plurals::class.java.fields.firstOrNull { it.getInt(null) == id }?.name ?: error("no plurals resource $id")

    private fun argCount(text: String): Int =
        ARG.findAll(text.replace("%%", "")).map { it.groupValues[1].ifEmpty { "1" } }.toSet().size

    /** `<string>` and `<plurals>` of strings_insights_trends.xml, with the XML's quoting removed. */
    private class Strings(val ru: Boolean, val strings: Map<String, String>, val plurals: Map<String, Map<String, String>>) {

        /** The CLDR integer plural rule of en / ru. */
        fun plural(name: String, n: Int): String {
            val items = plurals.getValue(name)
            val quantity = when {
                !ru -> if (n == 1) "one" else "other"
                n % 10 == 1 && n % 100 != 11 -> "one"
                n % 10 in 2..4 && n % 100 !in 12..14 -> "few"
                else -> "many"
            }
            return items[quantity] ?: items.getValue("other")
        }

        companion object {
            fun load(dir: String): Strings {
                val root = DocumentBuilderFactory.newInstance().newDocumentBuilder()
                    .parse(File("src/main/res/$dir/strings_insights_trends.xml")).documentElement
                val strings = root.getElementsByTagName("string").let { nodes ->
                    (0 until nodes.length).associate { i ->
                        val el = nodes.item(i) as Element
                        el.getAttribute("name") to el.textContent.removeSurrounding("\"")
                    }
                }
                val plurals = root.getElementsByTagName("plurals").let { nodes ->
                    (0 until nodes.length).associate { i ->
                        val el = nodes.item(i) as Element
                        val items = el.getElementsByTagName("item")
                        el.getAttribute("name") to (0 until items.length).associate { j ->
                            val item = items.item(j) as Element
                            item.getAttribute("quantity") to item.textContent
                        }
                    }
                }
                return Strings(dir.endsWith("-ru"), strings, plurals)
            }
        }
    }

    private companion object {
        const val HOUR = 3_600_000.0

        val BERLIN: ZoneId = ZoneId.of("Europe/Berlin")

        val ARG = Regex("""%(?:(\d+)\$)?[sd]""")

        /** The week of Monday 1 June 2026 in Berlin, 5h tracked. */
        val week: BucketUsage = run {
            val start = LocalDate.of(2026, 6, 1).atStartOfDay(BERLIN).toInstant().toEpochMilli()
            val end = LocalDate.of(2026, 6, 8).atStartOfDay(BERLIN).toInstant().toEpochMilli()
            BucketUsage(start, end, (5 * HOUR).toLong())
        }
    }
}
