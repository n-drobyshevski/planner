package page.planr.android.reminders

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

class StartsInTest {
    private val start = Instant.parse("2026-10-06T08:30:00Z")

    @Test
    fun `ahead of the start it counts the minutes, rounded`() {
        assertEquals(StartsIn.Minutes(10), StartsIn.between(start - 10.minutes, start))
        assertEquals(StartsIn.Minutes(10), StartsIn.between(start - 10.minutes + 20.seconds, start), "a late alarm")
        assertEquals(StartsIn.Minutes(1), StartsIn.between(start - 45.seconds, start))
    }

    @Test
    fun `within half a minute of the start is now`() {
        assertEquals(StartsIn.Now, StartsIn.between(start, start))
        assertEquals(StartsIn.Now, StartsIn.between(start - 20.seconds, start))
        assertEquals(StartsIn.Now, StartsIn.between(start + 20.seconds, start))
    }

    @Test
    fun `after the start (a snooze past it) it says how long ago`() {
        assertEquals(StartsIn.StartedAgo(5), StartsIn.between(start + 5.minutes, start))
    }
}
