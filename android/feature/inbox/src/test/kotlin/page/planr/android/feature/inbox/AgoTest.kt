package page.planr.android.feature.inbox

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import page.planr.android.feature.inbox.ui.Ago
import page.planr.android.feature.inbox.ui.AgoUnit

/** The "Ended 2 hours ago" quantities, rounded as the web's `formatDistance` rounds. */
class AgoTest {
    private val now = TestData.NOW

    private fun ago(before: Duration) = Ago.between(now - before, now)

    @Test
    fun `under a minute still reads as a minute, never zero`() {
        assertEquals(Ago(1, AgoUnit.Minutes), ago(20.seconds))
        assertEquals(Ago(1, AgoUnit.Minutes), ago(Duration.ZERO))
    }

    @Test
    fun `minutes up to 45, then about an hour`() {
        assertEquals(Ago(44, AgoUnit.Minutes), ago(44.minutes))
        assertEquals(Ago(1, AgoUnit.Hours), ago(45.minutes))
        assertEquals(Ago(1, AgoUnit.Hours), ago(89.minutes))
        assertEquals(Ago(2, AgoUnit.Hours), ago(90.minutes))
    }

    @Test
    fun `hours round to the nearest, under a day`() {
        assertEquals(Ago(3, AgoUnit.Hours), ago(2.hours + 31.minutes))
        assertEquals(Ago(23, AgoUnit.Hours), ago(23.hours))
    }

    @Test
    fun `a day up to 42 hours, then rounded days`() {
        assertEquals(Ago(1, AgoUnit.Days), ago(1.days))
        assertEquals(Ago(1, AgoUnit.Days), ago(41.hours))
        assertEquals(Ago(2, AgoUnit.Days), ago(42.hours))
        assertEquals(Ago(3, AgoUnit.Days), ago(3.days))
    }
}
