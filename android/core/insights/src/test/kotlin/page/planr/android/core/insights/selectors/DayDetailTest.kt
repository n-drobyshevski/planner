package page.planr.android.core.insights.selectors

import java.text.Collator
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import page.planr.android.core.insights.fixtures.Fixtures
import page.planr.android.core.insights.fixtures.Fixtures.long
import page.planr.android.core.insights.fixtures.Fixtures.longs
import page.planr.android.core.insights.fixtures.Fixtures.spans
import page.planr.android.core.insights.fixtures.Fixtures.window
import page.planr.android.core.insights.fixtures.Fixtures.zone
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.model.Span
import page.planr.android.core.model.EventKind

/** Golden parity of [DayDetail] with view-selectors.ts `buildDayDetail` / `clippedMs`, plus the Android-only fallback. */
class DayDetailTest {

    @TestFactory
    fun buildDayDetail(): List<DynamicTest> = Fixtures.section("day-detail", "buildDayDetail") { input ->
        val period = input.getValue("period").jsonObject
        // The fixture's titles were ordered by UTF-16 code unit: the same as naturalOrder().
        Fixtures.json(
            DayDetail.build(
                dayMs = input.long("dayMs"),
                period = period(period.longs("days"), period.window("window")),
                spans = input.spans("spans"),
                zone = input.zone("zone"),
                titleOrder = naturalOrder(),
            ),
        )
    }

    @TestFactory
    fun clippedMs(): List<DynamicTest> = Fixtures.section("day-detail", "clippedMs") { input ->
        val span = Fixtures.span(input.getValue("span").jsonObject)
        JsonPrimitive(DayDetail.clippedMs(span, input.long("start"), input.long("end")))
    }

    @Test
    fun sectionsCovered() = Fixtures.assertSections("day-detail", setOf("buildDayDetail", "clippedMs"))

    @Test
    fun `a day outside the period ends at the next local midnight, also on a DST day`() {
        // Berlin springs forward on 2026-03-29: the day is 23 h long. The web adds 24 h here.
        val dayMs = midnight(LocalDate.of(2026, 3, 29))
        val period = period(days = listOf(midnight(LocalDate.of(2026, 6, 8))), window = MsWindow(0, Long.MAX_VALUE))
        val late = span("late", "Late", at(2026, 3, 29, 23, 0), at(2026, 3, 30, 0, 30))

        val detail = DayDetail.build(dayMs, period, listOf(late), berlin, naturalOrder())

        assertEquals(midnight(LocalDate.of(2026, 3, 30)), detail.dayEnd)
        assertEquals(23 * HOUR, detail.dayEnd - detail.dayStart)
        assertEquals(LocalDate.of(2026, 3, 29), detail.date)
        assertEquals(listOf("late"), detail.items.map { it.key })
        assertEquals(HOUR, detail.totalMs)
    }

    @Test
    fun `the day ends at the next day of the period, or at the window end`() {
        val days = (8..14).map { midnight(LocalDate.of(2026, 6, it)) }
        val end = midnight(LocalDate.of(2026, 6, 15))
        val period = period(days, MsWindow(days.first(), end))

        assertEquals(days[3], DayDetail.build(days[2], period, emptyList(), berlin, naturalOrder()).dayEnd)
        assertEquals(end, DayDetail.build(days.last(), period, emptyList(), berlin, naturalOrder()).dayEnd)
    }

    @Test
    fun `items sort by start, then by title through a Russian collator`() {
        val day = midnight(LocalDate.of(2026, 6, 10))
        val nine = at(2026, 6, 10, 9, 0)
        val spans = listOf(
            span("late", "Ёлка", at(2026, 6, 10, 18, 0), at(2026, 6, 10, 19, 0)),
            span("ya", "Яблоко", nine, nine + HOUR),
            span("ye", "ёж", nine, nine + HOUR),
            span("a", "арбуз", nine, nine + HOUR),
            span("early", "Шахматы", at(2026, 6, 10, 7, 0), at(2026, 6, 10, 8, 0)),
        )
        val collator: Comparator<in String> = Collator.getInstance(Locale.forLanguageTag("ru-RU"))
        val period = period(listOf(day), MsWindow(day, midnight(LocalDate.of(2026, 6, 11))))

        val detail = DayDetail.build(day, period, spans, berlin, collator)

        // Code-unit order would put "Яблоко" (U+042F) before "арбуз" and "ёж" (U+0451) last.
        assertEquals(listOf("early", "a", "ye", "ya", "late"), detail.items.map { it.key })
    }

    @Test
    fun `inactive items are listed but not counted, and every item is clipped to the day`() {
        val day = midnight(LocalDate.of(2026, 6, 10))
        val next = midnight(LocalDate.of(2026, 6, 11))
        val spans = listOf(
            span("sleep", "Sleep", at(2026, 6, 9, 23, 30), at(2026, 6, 10, 7, 0), inactive = true),
            span("long", "Trip", at(2026, 6, 9, 20, 0), at(2026, 6, 11, 2, 0)),
            span("outside", "Tomorrow", next, next + HOUR),
        )
        val detail = DayDetail.build(day, period(listOf(day), MsWindow(day, next)), spans, berlin, naturalOrder())

        assertEquals(listOf("long", "sleep"), detail.items.map { it.key })
        assertEquals(24 * HOUR, detail.totalMs)
    }

    private val berlin: ZoneId = ZoneId.of("Europe/Berlin")

    private fun midnight(date: LocalDate): Long = date.atStartOfDay(berlin).toInstant().toEpochMilli()

    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int): Long =
        LocalDateTime.of(y, mo, d, h, mi).atZone(berlin).toInstant().toEpochMilli()

    private fun span(key: String, title: String, start: Long, end: Long, inactive: Boolean = false) = Span(
        key = key,
        eventId = key,
        title = title,
        start = start,
        end = end,
        kind = EventKind.Event,
        allDay = false,
        inactive = inactive,
        ownerId = "me",
        isShared = false,
        categoryId = null,
        attributes = Attributes.None,
    )

    /** Only `days` and `window` matter to the day sheet. */
    private fun period(days: List<Long>, window: MsWindow) = ResolvedPeriod(
        window = window,
        days = days,
        buckets = emptyList(),
        granularity = Granularity.Day,
        prevWindow = MsWindow(window.start, window.start),
        prevDays = emptyList(),
        clamped = false,
    )

    private companion object {
        const val HOUR = 3_600_000L
    }
}
