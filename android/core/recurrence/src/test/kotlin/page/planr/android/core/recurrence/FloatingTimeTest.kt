package page.planr.android.core.recurrence

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.datetime.TimeZone

class FloatingTimeTest {

    private val berlin = TimeZone.of("Europe/Berlin")

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilliseconds()

    @Test
    fun `fromReal carries the local wall clock in UTC fields`() {
        // 07:00Z on 2026-03-30 is 09:00 CEST.
        assertEquals(ms("2026-03-30T09:00:00Z"), FloatingTime.fromReal(ms("2026-03-30T07:00:00Z"), berlin))
    }

    @Test
    fun `fromReal drops milliseconds, like TZDate field reads`() {
        assertEquals(ms("2026-03-30T09:00:00Z"), FloatingTime.fromReal(ms("2026-03-30T07:00:00.750Z"), berlin))
    }

    @Test
    fun `toReal moves a spring-forward gap time forward by the gap`() {
        // 02:30 does not exist on 2026-03-29 in Berlin; TZDate resolves it to 03:30 CEST.
        assertEquals(ms("2026-03-29T01:30:00Z"), FloatingTime.toReal(ms("2026-03-29T02:30:00Z"), berlin))
    }

    @Test
    fun `toReal takes the earlier offset in a fall-back overlap`() {
        // 02:30 happens twice on 2026-10-25; the first (CEST) is 00:30Z.
        assertEquals(ms("2026-10-25T00:30:00Z"), FloatingTime.toReal(ms("2026-10-25T02:30:00Z"), berlin))
    }

    @Test
    fun `UTC is the identity`() {
        val t = ms("2026-03-29T02:30:00Z")
        assertEquals(t, FloatingTime.toReal(FloatingTime.fromReal(t, TimeZone.UTC), TimeZone.UTC))
    }
}
