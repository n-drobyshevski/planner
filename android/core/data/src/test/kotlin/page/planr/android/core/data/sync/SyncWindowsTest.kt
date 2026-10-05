package page.planr.android.core.data.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.datetime.TimeZone

class SyncWindowsTest {
    private val berlin = TimeZone.of("Europe/Berlin")

    private fun clockAt(iso: String) = object : Clock {
        override fun now() = Instant.parse(iso)
    }

    @Test
    fun `mid-month, the month grid is wider than today plus or minus a week`() {
        // Sat 17 Oct 2026: October's grid runs Mon 28 Sep to Sun 1 Nov.
        val window = SyncWindows.aroundToday(clockAt("2026-10-17T10:00:00Z"), berlin)
        assertEquals(Instant.parse("2026-09-27T22:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-11-01T23:00:00Z"), window.end)
    }

    @Test
    fun `at a month's edge, the week around today reaches past the grid`() {
        // Fri 30 Oct 2026: +7 days is 6 Nov, beyond the grid's 1 Nov.
        val window = SyncWindows.aroundToday(clockAt("2026-10-30T10:00:00Z"), berlin)
        assertEquals(Instant.parse("2026-09-27T22:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-11-06T23:00:00Z"), window.end)
    }
}
