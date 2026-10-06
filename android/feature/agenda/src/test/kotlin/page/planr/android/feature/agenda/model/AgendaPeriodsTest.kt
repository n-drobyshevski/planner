package page.planr.android.feature.agenda.model

import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import org.junit.Test

class AgendaPeriodsTest {
    private val sunday = LocalDate(2026, 10, 4)

    @Test
    fun `weeks start on Monday`() {
        assertEquals(LocalDate(2026, 9, 28), AgendaPeriods.periodStart(AgendaMode.Week, sunday))
        assertEquals(LocalDate(2026, 10, 5), AgendaPeriods.periodStart(AgendaMode.Week, LocalDate(2026, 10, 5)))
        assertEquals(sunday, AgendaPeriods.periodStart(AgendaMode.Day, sunday))
    }

    @Test
    fun `offsets count whole periods from today, also backwards`() {
        assertEquals(1, AgendaPeriods.offsetOf(AgendaMode.Week, sunday, LocalDate(2026, 10, 5)))
        assertEquals(0, AgendaPeriods.offsetOf(AgendaMode.Week, sunday, LocalDate(2026, 9, 28)))
        assertEquals(-1, AgendaPeriods.offsetOf(AgendaMode.Week, sunday, LocalDate(2026, 9, 27)))
        assertEquals(-3, AgendaPeriods.offsetOf(AgendaMode.Day, sunday, LocalDate(2026, 10, 1)))
        assertEquals(LocalDate(2026, 10, 12), AgendaPeriods.shiftedStart(AgendaMode.Week, sunday, 2))
    }

    @Test
    fun `months are calendar months of whatever length, paged by month`() {
        assertEquals(LocalDate(2026, 10, 1), AgendaPeriods.periodStart(AgendaMode.Month, sunday))
        assertEquals(LocalDate(2026, 11, 1), AgendaPeriods.shiftedStart(AgendaMode.Month, LocalDate(2026, 10, 31), 1))
        // From 31 January, the next month is February, not 3 March.
        assertEquals(LocalDate(2027, 2, 1), AgendaPeriods.shiftedStart(AgendaMode.Month, LocalDate(2027, 1, 31), 1))
        assertEquals(LocalDate(2025, 12, 1), AgendaPeriods.shiftedStart(AgendaMode.Month, sunday, -10))
        assertEquals(0, AgendaPeriods.offsetOf(AgendaMode.Month, sunday, LocalDate(2026, 10, 31)))
        assertEquals(1, AgendaPeriods.offsetOf(AgendaMode.Month, LocalDate(2026, 10, 31), LocalDate(2026, 11, 1)))
        assertEquals(-13, AgendaPeriods.offsetOf(AgendaMode.Month, sunday, LocalDate(2025, 9, 30)))
    }

    @Test
    fun `a month draws six Monday-first weeks, padded with its neighbours' days`() {
        val october = AgendaPeriods.days(AgendaMode.Month, LocalDate(2026, 10, 1))
        assertEquals(42, october.size)
        assertEquals(LocalDate(2026, 9, 28), october.first())
        assertEquals(LocalDate(2026, 11, 8), october.last())
        // February 2027 fits four weeks exactly; two of March's pad it.
        val february = AgendaPeriods.days(AgendaMode.Month, LocalDate(2027, 2, 1))
        assertEquals(LocalDate(2027, 2, 1), february.first())
        assertEquals(LocalDate(2027, 3, 14), february.last())

        // Loaded: September's grid through November's, one run of days.
        val loaded = AgendaPeriods.loadedDays(AgendaMode.Month, LocalDate(2026, 10, 1))
        assertEquals(LocalDate(2026, 8, 31), loaded.first())
        assertEquals(LocalDate(2026, 12, 6), loaded.last())
        assertEquals(loaded.size, loaded.distinct().size)
    }

    @Test
    fun `the loaded window spans a period either side, at local midnight`() {
        val days = AgendaPeriods.loadedDays(AgendaMode.Day, sunday)
        assertEquals(listOf(LocalDate(2026, 10, 3), sunday, LocalDate(2026, 10, 5)), days)

        val window = AgendaPeriods.windowOf(days, TimeZone.of("Europe/Berlin"))
        assertEquals(Instant.parse("2026-10-02T22:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-10-05T22:00:00Z"), window.end)
        assertEquals(21, AgendaPeriods.loadedDays(AgendaMode.Week, LocalDate(2026, 9, 28)).size)
    }
}
