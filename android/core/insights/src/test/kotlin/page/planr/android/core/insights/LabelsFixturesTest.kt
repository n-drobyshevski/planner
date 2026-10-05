package page.planr.android.core.insights

import java.time.DayOfWeek
import java.time.Month
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.double
import page.planr.android.core.insights.fixtures.Fixtures.granularity
import page.planr.android.core.insights.fixtures.Fixtures.int
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.string
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.fixtures.Fixtures.zone
import page.planr.android.core.insights.labels.DateNames
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow

/**
 * Golden parity of the Insights labels with date-fns and lib/datetime/format.ts
 * (fixtures/labels.json): name tables, durations, bucket and range labels, day
 * labels, times and date keys, in en and ru.
 */
class LabelsFixturesTest {

    @TestFactory
    fun dateNames(): List<DynamicTest> = Fixtures.section("labels", "dateNames") { input ->
        val index = input.int("index")
        val l = input.locale()
        JsonPrimitive(
            when (val table = input.string("table")) {
                "monthAbbr" -> DateNames.monthAbbr(index, l)
                "monthWide" -> DateNames.monthWide(index, l)
                "weekdayAbbr" -> DateNames.weekdayAbbr(index, l)
                "weekdayWide" -> DateNames.weekdayWide(index, l)
                else -> error("unknown table $table")
            },
        )
    }

    @TestFactory
    fun duration(): List<DynamicTest> = Fixtures.section("labels", "duration") { input ->
        JsonPrimitive(DurationFormat.format(input.double("ms"), input.locale()))
    }

    @TestFactory
    fun bucketTick(): List<DynamicTest> = Fixtures.section("labels", "bucketTick") { input ->
        val g = input.granularity("granularity")
        JsonPrimitive(InsightsLabels.bucketTick(input.long("startMs"), g, input.zone("zone"), input.locale()))
    }

    @TestFactory
    fun bucketLabel(): List<DynamicTest> = Fixtures.section("labels", "bucketLabel") { input ->
        val g = input.granularity("granularity")
        JsonPrimitive(InsightsLabels.bucketLabel(input.window("bucket"), g, input.zone("zone"), input.locale()))
    }

    @TestFactory
    fun rangeText(): List<DynamicTest> = Fixtures.section("labels", "rangeText") { input ->
        JsonPrimitive(InsightsLabels.rangeText(input.window("window"), input.zone("zone"), input.locale()))
    }

    @TestFactory
    fun weekdayDayMonth(): List<DynamicTest> = dayLabel("weekdayDayMonth", InsightsLabels::weekdayDayMonth)

    @TestFactory
    fun weekdayDayMonthNoComma(): List<DynamicTest> =
        dayLabel("weekdayDayMonthNoComma", InsightsLabels::weekdayDayMonthNoComma)

    @TestFactory
    fun dayTitle(): List<DynamicTest> = dayLabel("dayTitle", InsightsLabels::dayTitle)

    @TestFactory
    fun weekdayDayMonthWide(): List<DynamicTest> = dayLabel("weekdayDayMonthWide", InsightsLabels::weekdayDayMonthWide)

    @TestFactory
    fun time(): List<DynamicTest> = Fixtures.section("labels", "time") { input ->
        JsonPrimitive(InsightsLabels.time(input.long("ms"), input.zone("zone")))
    }

    @TestFactory
    fun dateKey(): List<DynamicTest> = Fixtures.section("labels", "dateKey") { input ->
        JsonPrimitive(InsightsLabels.dateKey(input.long("ms"), input.zone("zone")))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections(
        "labels",
        setOf(
            "dateNames", "duration", "bucketTick", "bucketLabel", "rangeText", "weekdayDayMonth",
            "weekdayDayMonthNoComma", "dayTitle", "weekdayDayMonthWide", "time", "dateKey",
        ),
    )

    @Test
    fun `ru names are the date-fns tables, not CLDR`() {
        // CLDR (java.time) prints "февр." and "пн"; the web prints "фев." and "пнд".
        val ru = Locale.forLanguageTag("ru")
        assertEquals("фев.", DateNames.monthAbbr(2, LabelLocale.Ru))
        assertNotEquals(Month.FEBRUARY.getDisplayName(TextStyle.SHORT, ru), DateNames.monthAbbr(2, LabelLocale.Ru))
        assertEquals("пнд", DateNames.weekdayAbbr(1, LabelLocale.Ru))
        assertNotEquals(DayOfWeek.MONDAY.getDisplayName(TextStyle.SHORT, ru), DateNames.weekdayAbbr(1, LabelLocale.Ru))
    }

    @Test
    fun `ru month labels keep the web's genitive`() {
        val june = MsWindow(1_780_264_800_000, 1_782_856_800_000) // June 2026 in Berlin
        assertEquals("июня 2026", InsightsLabels.bucketLabel(june, Granularity.Month, BERLIN, LabelLocale.Ru))
        assertEquals("June 2026", InsightsLabels.bucketLabel(june, Granularity.Month, BERLIN, LabelLocale.En))
    }

    @Test
    fun `labels read the given zone, not the JVM default`() {
        // 2026-06-10T22:30Z is still the 10th in Los Angeles but already the 11th in Berlin
        // (and in the Pacific/Chatham test default).
        val ms = 1_781_130_600_000
        assertEquals("2026-06-10", InsightsLabels.dateKey(ms, ZoneId.of("America/Los_Angeles")))
        assertEquals("2026-06-11", InsightsLabels.dateKey(ms, BERLIN))
        assertEquals("15:30", InsightsLabels.time(ms, ZoneId.of("America/Los_Angeles")))
    }

    @Test
    fun `durations round like JS and clamp at zero`() {
        assertEquals(DurationFormat.Parts(1, 0), DurationFormat.parts(59 * 60_000.0 + 30_000))
        assertEquals("0m", DurationFormat.format(-90_000.0, LabelLocale.En))
        assertEquals("2 ч 30 мин", DurationFormat.format(9_000_000.0, LabelLocale.Ru))
    }

    private fun dayLabel(section: String, label: (Long, ZoneId, LabelLocale) -> String): List<DynamicTest> =
        Fixtures.section("labels", section) { input ->
            JsonPrimitive(label(input.long("ms"), input.zone("zone"), input.locale()))
        }

    private fun JsonObject.locale(): LabelLocale = when (val tag = string("locale")) {
        "en" -> LabelLocale.En
        "ru" -> LabelLocale.Ru
        else -> error("unknown locale $tag")
    }

    private companion object {
        val BERLIN: ZoneId = ZoneId.of("Europe/Berlin")
    }
}
