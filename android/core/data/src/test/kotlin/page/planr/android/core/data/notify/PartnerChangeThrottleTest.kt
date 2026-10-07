package page.planr.android.core.data.notify

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import page.planr.android.core.data.notify.PartnerChange.Kind
import page.planr.android.core.data.notify.PartnerChangeThrottle.Offer

/** At most one partner-change notification every two minutes, the rest held and merged. */
class PartnerChangeThrottleTest {
    private val t0 = Instant.parse("2026-10-07T09:00:00Z")
    private val at = t0 + 5.hours

    private fun change(kind: Kind, id: String = "e1", start: Instant = at, previous: Instant? = null) =
        PartnerChange(kind, id, "Dinner", start, start + 1.hours, previousStart = previous)

    @Test
    fun `the first changes post at once, later ones wait for the interval, then post together`() {
        val throttle = PartnerChangeThrottle()
        val first = change(Kind.Added, "a")

        assertEquals(Offer.Post(listOf(first)), throttle.offer(listOf(first), t0))

        val second = change(Kind.Added, "b")
        assertEquals(Offer.WaitUntil(t0 + 2.minutes), throttle.offer(listOf(second), t0 + 30.seconds))
        val third = change(Kind.Removed, "c")
        assertEquals(Offer.Held, throttle.offer(listOf(third), t0 + 60.seconds), "a flush is already scheduled")

        assertEquals(listOf(second, third), throttle.due(t0 + 2.minutes))
        assertEquals(emptyList(), throttle.due(t0 + 2.minutes), "nothing twice")

        // The flush was a post: the next change waits again.
        assertEquals(Offer.WaitUntil(t0 + 4.minutes), throttle.offer(listOf(change(Kind.Added, "d")), t0 + 3.minutes))
    }

    @Test
    fun `after a quiet spell a change posts at once again`() {
        val throttle = PartnerChangeThrottle()
        throttle.offer(listOf(change(Kind.Added, "a")), t0)

        val later = change(Kind.Added, "b")
        assertEquals(Offer.Post(listOf(later)), throttle.offer(listOf(later), t0 + 2.minutes))
    }

    @Test
    fun `nothing found holds nothing`() {
        assertEquals(Offer.Held, PartnerChangeThrottle().offer(emptyList(), t0))
    }

    @Test
    fun `held changes to one event merge into what the reader needs to know`() {
        val throttle = PartnerChangeThrottle()
        throttle.offer(listOf(change(Kind.Added, "warmup")), t0)

        throttle.offer(
            listOf(
                // Added, then moved: still just added, at its new time.
                change(Kind.Added, "a"),
                change(Kind.Moved, "a", start = at + 1.hours, previous = at),
                // Added, then removed: nothing to say.
                change(Kind.Added, "b"),
                change(Kind.Removed, "b"),
                // Moved twice: from where it first was.
                change(Kind.Moved, "c", start = at + 1.hours, previous = at),
                change(Kind.Moved, "c", start = at + 2.hours, previous = at + 1.hours),
                // Moved and moved back: nothing to say.
                change(Kind.Moved, "d", start = at + 1.hours, previous = at),
                change(Kind.Moved, "d", start = at, previous = at + 1.hours),
                // Moved, then cancelled: cancelled.
                change(Kind.Moved, "e", start = at + 1.hours, previous = at),
                change(Kind.Cancelled, "e", start = at + 1.hours),
            ),
            t0 + 10.seconds,
        )

        assertEquals(
            listOf(
                change(Kind.Added, "a", start = at + 1.hours),
                change(Kind.Moved, "c", start = at + 2.hours, previous = at),
                change(Kind.Cancelled, "e", start = at + 1.hours),
            ),
            throttle.due(t0 + 2.minutes),
        )
    }

    @Test
    fun `clearing drops what is held`() {
        val throttle = PartnerChangeThrottle()
        throttle.offer(listOf(change(Kind.Added, "a")), t0)
        throttle.offer(listOf(change(Kind.Added, "b")), t0 + 10.seconds)

        throttle.clear()

        assertEquals(emptyList(), throttle.due(t0 + 2.minutes))
    }
}
