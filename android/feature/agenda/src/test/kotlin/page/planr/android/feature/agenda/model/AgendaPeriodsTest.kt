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
    fun `the loaded window spans a period either side, at local midnight`() {
        val days = AgendaPeriods.loadedDays(AgendaMode.Day, sunday)
        assertEquals(listOf(LocalDate(2026, 10, 3), sunday, LocalDate(2026, 10, 5)), days)

        val window = AgendaPeriods.windowOf(days, TimeZone.of("Europe/Berlin"))
        assertEquals(Instant.parse("2026-10-02T22:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-10-05T22:00:00Z"), window.end)
        assertEquals(21, AgendaPeriods.loadedDays(AgendaMode.Week, LocalDate(2026, 9, 28)).size)
    }
}
