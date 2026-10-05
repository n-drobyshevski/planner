package page.planr.android.feature.insights.tasks

import java.io.File
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.w3c.dom.Element
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.ledes.Ledes
import page.planr.android.core.insights.model.ComparisonUnit
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LeadTime
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.TaskStats
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.UiText

/**
 * [TasksText] without a Context: every lede key / token branch that
 * Ledes.tasks can produce maps to an existing Tasks string or plural with as
 * many args as it has format args, and renders the web's sentence in en and
 * ru. Strings are read from the module's XML (the unit-test working directory).
 */
class TasksTextTest {

    private val en = Strings.load("values")
    private val ru = Strings.load("values-ru")

    @Test
    fun `every lede branch maps to a Tasks resource with matching args`() {
        val keys = mutableSetOf<String>()
        val clauses = mutableSetOf<String>()
        for (preset in PeriodPreset.entries) {
            for (overdue in listOf(0, 1, 3)) {
                for (done in listOf(0, 1, 2, 5, 21)) {
                    for (prevDone in listOf(0, 1, 5)) {
                        for (rate in listOf(null, 0.0, 0.5, 1.0)) {
                            val lede = Ledes.tasks(stats(done, overdue, rate), stats(prevDone), preset)
                            for (line in listOfNotNull(lede.headline, lede.support)) {
                                keys += line.key
                                val spec = TasksText.ledeSpec(line)
                                checkArgs(spec, line)
                                clauses += nestedNames(spec)
                            }
                        }
                    }
                }
            }
        }
        assertEquals(
            setOf("lede.tasksOverdueHeadline", "lede.tasksDoneSupport", "lede.tasksDoneHeadline", "lede.tasksAdherenceSupport"),
            keys,
        )
        // Every more / fewer × week / month / period clause is reached.
        assertEquals(
            ComparisonUnit.entries.flatMap { listOf(TasksText.moreClause(it), TasksText.fewerClause(it)) }.map(::nameOf).toSet(),
            clauses,
        )
    }

    @Test
    fun `the done headline is the web sentence, with or without the comparison clause`() {
        assertEquals(
            "You finished 3 tasks in this period, 2 more than the previous week.",
            headline(done = 3, prevDone = 1, PeriodPreset.ThisWeek, LabelLocale.En),
        )
        assertEquals(
            "You finished 1 task in this period, 4 fewer than the previous month.",
            headline(done = 1, prevDone = 5, PeriodPreset.ThisMonth, LabelLocale.En),
        )
        // No previous completions: "level", no clause.
        assertEquals("You finished 2 tasks in this period.", headline(done = 2, prevDone = 0, PeriodPreset.Last30d, LabelLocale.En))
        assertEquals(
            "За этот период выполнено 21 задача, на 16 больше, чем за предыдущий период.",
            headline(done = 21, prevDone = 5, PeriodPreset.Last7d, LabelLocale.Ru),
        )
        assertEquals(
            "За этот период выполнено 5 задач, на 1 меньше, чем за предыдущую неделю.",
            headline(done = 5, prevDone = 6, PeriodPreset.LastWeek, LabelLocale.Ru),
        )
        assertEquals("За этот период выполнено 3 задачи.", headline(done = 3, prevDone = 3, PeriodPreset.ThisWeek, LabelLocale.Ru))
    }

    @Test
    fun `overdue tasks take the headline, and done moves to the support line`() {
        val lede = Ledes.tasks(stats(done = 4, overdue = 2), stats(1), PeriodPreset.ThisWeek)
        assertEquals("2 tasks are overdue and still open.", render(TasksText.ledeSpec(lede.headline), en))
        assertEquals("You finished 4 tasks in this period.", render(TasksText.ledeSpec(checkNotNull(lede.support)), en))
        assertEquals("Просрочено и всё ещё открыто 2 задачи.", render(TasksText.ledeSpec(lede.headline), ru))
        val one = Ledes.tasks(stats(done = 1, overdue = 1), stats(0), PeriodPreset.ThisWeek)
        assertEquals("1 task is overdue and still open.", render(TasksText.ledeSpec(one.headline), en))
        assertEquals("За этот период выполнено 1 задача.", render(TasksText.ledeSpec(checkNotNull(one.support)), ru))
    }

    @Test
    fun `the adherence support line rounds like Math round`() {
        val lede = Ledes.tasks(stats(done = 2, rate = 0.625), stats(2), PeriodPreset.ThisWeek)
        assertEquals("63% of due tasks landed on time.", render(TasksText.ledeSpec(checkNotNull(lede.support)), en))
        assertEquals("63% задач к сроку сделаны вовремя.", render(TasksText.ledeSpec(checkNotNull(lede.support)), ru))
    }

    @Test
    fun `other tabs' lede keys are rejected`() {
        assertFailsWith<IllegalStateException> { TasksText.ledeSpec(LedeLine("lede.trendsHeadline", emptyMap())) }
    }

    @Test
    fun `lead time prints a duration under two days, else days and hours`() {
        assertEquals("—", render(TasksText.leadTimeSpec(null, LabelLocale.En), en))
        assertEquals("5h 30m", render(TasksText.leadTimeSpec(LeadTime.Short(5.5 * HOUR), LabelLocale.En), en))
        assertEquals("5 ч 30 мин", render(TasksText.leadTimeSpec(LeadTime.Short(5.5 * HOUR), LabelLocale.Ru), ru))
        assertEquals("3d", render(TasksText.leadTimeSpec(LeadTime.DaysHours(3, 0), LabelLocale.En), en))
        assertEquals("9d 17h", render(TasksText.leadTimeSpec(LeadTime.DaysHours(9, 17), LabelLocale.En), en))
        // The web's "2d 24h" is reproduced (§H.17).
        assertEquals("2d 24h", render(TasksText.leadTimeSpec(LeadTime.DaysHours(2, 24), LabelLocale.En), en))
        assertEquals("2д 24ч", render(TasksText.leadTimeSpec(LeadTime.DaysHours(2, 24), LabelLocale.Ru), ru))
    }

    @Test
    fun `figures and hints`() {
        assertEquals("—", TasksText.percent(null))
        assertEquals("0%", TasksText.percent(0.0))
        assertEquals("67%", TasksText.percent(2.0 / 3))
        // Math.round, not half-even: 0.125 → 13%.
        assertEquals("13%", TasksText.percent(0.125))
        assertEquals("of 4 due", render(TasksText.onTimeHint(4), en))
        assertEquals("из 4 к сроку", render(TasksText.onTimeHint(4), ru))
        assertEquals("nothing due", render(TasksText.onTimeHint(0), en))
    }

    @Test
    fun `the per-granularity picks name their own granularity's string`() {
        val picks: List<Pair<(Granularity) -> Int, Int>> = listOf(TasksText::velocityTitle to 0, TasksText::velocityAria to 1)
        for ((pick, args) in picks) {
            for (g in Granularity.entries) {
                val name = nameOf(pick(g))
                assertTrue(name.endsWith("_${g.id}"), "$name for $g")
                assertEquals(args, argCount(en.strings.getValue(name)), "$name format args")
                assertEquals(args, argCount(ru.strings.getValue(name)), "$name format args (ru)")
            }
        }
        assertEquals(4, argCount(en.strings.getValue("insights_tasks_sr_summary")))
    }

    private fun headline(done: Int, prevDone: Int, preset: PeriodPreset, locale: LabelLocale): String {
        val line = Ledes.tasks(stats(done), stats(prevDone), preset).headline
        return render(TasksText.ledeSpec(line), if (locale == LabelLocale.Ru) ru else en)
    }

    /** Each resource text has exactly as many format args as the spec passes, nested clauses included. */
    private fun checkArgs(text: UiText, line: LedeLine) {
        val (name, args) = when (text) {
            is UiText.Res -> nameOf(text.id) to text.args
            is UiText.Plural -> pluralNameOf(text.id) to text.args
            is UiText.Raw -> return
        }
        assertTrue(name.startsWith("insights_tasks_lede_"), "${line.key} → $name")
        for (strings in listOf(en, ru)) {
            val texts = strings.strings[name]?.let(::listOf) ?: strings.plurals.getValue(name).values.toList()
            for (t in texts) assertEquals(argCount(t), args.size, "${line.key} → $name args")
        }
        args.filterIsInstance<UiText>().forEach { checkArgs(it, line) }
    }

    /** The names of the clause strings nested in [text]'s args. */
    private fun nestedNames(text: UiText): Set<String> {
        val args = when (text) {
            is UiText.Res -> text.args
            is UiText.Plural -> text.args
            is UiText.Raw -> emptyList()
        }
        return args.filterIsInstance<UiText.Res>().map { nameOf(it.id) }.toSet()
    }

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

    /** `<string>` and `<plurals>` of strings_insights_tasks.xml, with the XML's quoting removed. */
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
                    .parse(File("src/main/res/$dir/strings_insights_tasks.xml")).documentElement
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

        val ARG = Regex("""%(?:(\d+)\$)?[sd]""")

        fun stats(done: Int, overdue: Int = 0, rate: Double? = null) = TaskStats(
            createdCount = done,
            completedCount = done,
            dueCount = if (rate == null) 0 else 4,
            adherenceRate = rate,
            overdueOpenCount = overdue,
            completionRate = null,
            medianLeadTimeMs = null,
        )
    }
}
