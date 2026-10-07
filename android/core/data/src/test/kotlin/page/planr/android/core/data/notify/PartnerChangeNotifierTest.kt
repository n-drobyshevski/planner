package page.planr.android.core.data.notify

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import page.planr.android.core.data.notify.PartnerChange.Kind
import page.planr.android.core.data.sync.RowGone
import page.planr.android.core.model.PlannerEvent

/** The partner's changes: how they read (en/ru), and when they post. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PartnerChangeNotifierTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private fun digest() = PartnerChangeDigest(context.resources, FixedWhenFormats)

    // Wed 7 Oct 2026, 19:00 in Berlin.
    private val dinner = Instant.parse("2026-10-07T17:00:00Z")

    private fun change(kind: Kind, title: String = "Dinner", start: Instant = dinner, previous: Instant? = null, allDay: Boolean = false) =
        PartnerChange(kind, "id-$title", title, start, start + 1.hours, allDay, previous)

    // --- PartnerChangeDigest ---

    @Test
    fun `each change reads as one line`() {
        val d = digest()
        assertEquals("Moved Dinner to 19:30", d.line(change(Kind.Moved, start = dinner + 30.minutes, previous = dinner), berlin))
        assertEquals(
            "Moved Dinner to Thu 8 Oct, 19:00",
            d.line(change(Kind.Moved, start = dinner + 24.hours, previous = dinner), berlin),
            "to another day: the day too",
        )
        assertEquals("Added Gym, Thu 8 Oct, 18:00", d.line(change(Kind.Added, "Gym", Instant.parse("2026-10-08T16:00:00Z")), berlin))
        assertEquals("Removed Dinner (Wed 7 Oct, 19:00)", d.line(change(Kind.Removed), berlin))
        assertEquals("Cancelled Dinner (Wed 7 Oct, 19:00)", d.line(change(Kind.Cancelled), berlin))
        assertEquals("Added Trip, Thu 8 Oct", d.line(change(Kind.Added, "Trip", Instant.parse("2026-10-08T00:00:00Z"), allDay = true), berlin))
    }

    @Test
    fun `a new end alone reads as the new span, not a move`() {
        val d = digest()
        fun resized(start: Instant, end: Instant, allDay: Boolean = false) =
            PartnerChange(Kind.Resized, "e", "Dinner", start, end, allDay, previousStart = start, previousEnd = start + 1.hours)

        assertEquals("Changed Dinner to 19:00–21:00", d.line(resized(dinner, dinner + 2.hours), berlin))
        assertEquals(
            "Changed Dinner to Wed 7 Oct, 19:00 – Thu 8 Oct, 01:00",
            d.line(resized(dinner, dinner + 6.hours), berlin),
            "past midnight: both days",
        )
        val trip = Instant.parse("2026-10-08T00:00:00Z")
        assertEquals("Changed Dinner to Thu 8 Oct – Sat 10 Oct", d.line(resized(trip, trip + 72.hours, allDay = true), berlin))
        assertEquals("Changed Dinner to Thu 8 Oct", d.line(resized(trip, trip + 24.hours, allDay = true), berlin), "shortened to one day")
    }

    @Test
    fun `a single change is titled with the partner, the change its text, opening its day`() {
        val content = digest().content("Anna", listOf(change(Kind.Moved, "Dinner with parents", dinner + 24.hours, dinner)), berlin, id = 7)

        assertEquals("Anna", content.title, "short: a title shows on one line")
        assertEquals("Moved Dinner with parents to Thu 8 Oct, 19:00", content.text, "the text wraps when expanded")
        assertEquals(emptyList(), content.lines)
        assertEquals(NotifyTarget.Day(LocalDate(2026, 10, 8)), content.target)
        assertEquals(NotifyChannel.PartnerChanges, content.channel)
        assertEquals(7, content.id)
    }

    @Test
    fun `several changes are counted and listed, up to five`() {
        val changes = listOf(change(Kind.Added, "Gym", Instant.parse("2026-10-08T16:00:00Z"))) +
            (1..6).map { change(Kind.Removed, "Call $it") }

        val content = digest().content("Anna", changes, berlin, id = 1)

        assertEquals("7 changes from Anna", content.title)
        assertEquals("Added Gym, Thu 8 Oct, 18:00", content.text)
        assertEquals(5, content.lines.size)
        assertEquals("Removed Call 1 (Wed 7 Oct, 19:00)", content.lines[1])
        assertEquals(2, content.more)
        assertEquals(NotifyTarget.Day(LocalDate(2026, 10, 8)), content.target, "the first change's day")
    }

    @Test
    fun `an uncached partner is "Your partner"`() {
        assertEquals("Your partner", digest().content(null, listOf(change(Kind.Removed)), berlin, 1).title)
        assertEquals("Your partner", digest().content("  ", listOf(change(Kind.Removed)), berlin, 1).title)
    }

    @Test
    @Config(qualifiers = "ru")
    fun `russian reads the same changes without a gendered verb, and counts them`() {
        val d = digest()
        assertEquals("Перенесено: «Ужин» на 19:30", d.line(change(Kind.Moved, "Ужин", dinner + 30.minutes, dinner), berlin))
        assertEquals("Добавлено: «Спорт», Wed 7 Oct, 19:00", d.line(change(Kind.Added, "Спорт"), berlin))
        assertEquals("Удалено: «Ужин» (Wed 7 Oct, 19:00)", d.line(change(Kind.Removed, "Ужин"), berlin))
        assertEquals(
            "Новое время: «Ужин», 19:00–21:00",
            d.line(PartnerChange(Kind.Resized, "e", "Ужин", dinner, dinner + 2.hours, previousStart = dinner, previousEnd = dinner + 1.hours), berlin),
        )
        val single = d.content("Анна", listOf(change(Kind.Cancelled, "Ужин")), berlin, 1)
        assertEquals("Анна", single.title)
        assertEquals("Отменено: «Ужин» (Wed 7 Oct, 19:00)", single.text)
        assertEquals("Партнёр", d.content(null, listOf(change(Kind.Removed, "Ужин")), berlin, 1).title)

        fun title(n: Int) = d.content("Анна", (1..n).map { change(Kind.Removed, "e$it") }, berlin, 1).title
        assertEquals("Анна: 2 изменения", title(2))
        assertEquals("Анна: 5 изменений", title(5))
        assertEquals("Анна: 21 изменение", title(21))
        assertEquals("Партнёр: 2 изменения", d.content(null, (1..2).map { change(Kind.Removed, "e$it") }, berlin, 1).title)
    }

    // --- PartnerChangeNotifier ---

    private val prefs = FakeNotifyPrefs(partnerChanges = true).also { it.since = Instant.parse("2026-10-01T00:00:00Z") }
    private val port = FakeNotificationPort()
    private var foreground = false
    private val entered = MutableSharedFlow<Unit>()

    private fun TestScope.notifier(): PartnerChangeNotifier {
        val clock = object : Clock {
            // The test scheduler's virtual time, from 09:00.
            override fun now(): Instant = Instant.parse("2026-10-07T09:00:00Z") + testScheduler.currentTime.milliseconds
        }
        return PartnerChangeNotifier(
            prefs = prefs,
            audience = { NotifyAudience { NotifyViewer(ME, berlin, null, PARTNER, "Anna") } },
            port = port,
            foreground = object : AppForeground {
                override fun isForeground(): Boolean = foreground

                override fun entries(): Flow<Unit> = entered
            },
            digest = digest(),
            clock = clock,
            scope = backgroundScope,
        ).also { runCurrent() }
    }

    private fun event(id: String, start: Instant = dinner, by: String = PARTNER) = PlannerEvent(
        id = id,
        workspaceId = "ws",
        ownerId = PARTNER,
        title = id,
        start = start,
        end = start + 1.hours,
        timeZone = "Europe/Berlin",
        createdAt = Instant.parse("2026-10-07T08:00:00Z"),
        updatedAt = Instant.parse("2026-10-07T08:30:00Z"),
        updatedBy = by,
    )

    @Test
    fun `the partner's change posts at once, the next ones wait two minutes and come together`() = runTest {
        val notifier = notifier()

        notifier.eventsChanged(listOf(null to event("Gym")))
        runCurrent()
        assertEquals(listOf("Added Gym, Wed 7 Oct, 19:00"), port.posted.map { it.text })

        notifier.eventsChanged(listOf(event("Dinner") to event("Dinner", start = dinner + 30.minutes)))
        notifier.eventGone(null, RowGone("events", "Call", RowGone.Kind.Delete, PARTNER, PARTNER, "Call", dinner, dinner + 1.hours))
        runCurrent()
        assertEquals(1, port.posted.size, "held")

        advanceTimeBy(2.minutes)
        runCurrent()
        assertEquals(2, port.posted.size)
        assertEquals("2 changes from Anna", port.posted.last().title)
        assertEquals(listOf("Moved Dinner to 19:30", "Removed Call (Wed 7 Oct, 19:00)"), port.posted.last().lines)
        assertTrue(port.posted[0].id != port.posted[1].id, "a newer digest never replaces an unread one")
    }

    @Test
    fun `the viewer's own changes post nothing`() = runTest {
        val notifier = notifier()
        notifier.eventsChanged(listOf(null to event("Gym", by = ME)))
        runCurrent()
        assertEquals(emptyList(), port.posted)
    }

    @Test
    fun `in the foreground it doesn't listen, and what was held is dropped`() = runTest {
        val notifier = notifier()
        notifier.eventsChanged(listOf(null to event("Gym")))
        notifier.eventsChanged(listOf(null to event("Run")))
        runCurrent()
        assertEquals(1, port.posted.size)

        foreground = true
        assertFalse(notifier.listening)
        advanceTimeBy(2.minutes)
        runCurrent()
        assertEquals(1, port.posted.size, "on screen already")
    }

    @Test
    fun `a visit to the foreground drops what was held, though no change fell in it`() = runTest {
        val notifier = notifier()
        notifier.eventsChanged(listOf(null to event("Gym")))
        runCurrent()
        assertEquals(1, port.posted.size)

        advanceTimeBy(30.seconds)
        notifier.eventsChanged(listOf(null to event("Run")))
        runCurrent()

        // Opened at +40s (Run shows live), left at +80s; the flush falls due at +2m.
        advanceTimeBy(10.seconds)
        foreground = true
        entered.emit(Unit)
        advanceTimeBy(40.seconds)
        foreground = false
        advanceTimeBy(2.minutes)
        runCurrent()

        assertEquals(1, port.posted.size, "Run was seen on screen")

        // Later changes post as before.
        notifier.eventsChanged(listOf(null to event("Swim")))
        runCurrent()
        assertEquals(listOf("Added Swim, Wed 7 Oct, 19:00"), port.posted.drop(1).map { it.text })
    }

    @Test
    fun `off, nothing listens`() = runTest {
        prefs.partnerChanges.value = false
        val notifier = notifier()
        assertFalse(notifier.listening)

        notifier.report { listOf(change(Kind.Added)) }
        assertEquals(emptyList(), port.posted)
    }

    @Test
    fun `sign-out drops what is held and takes down what shows`() = runTest {
        val notifier = notifier()
        notifier.eventsChanged(listOf(null to event("Gym")))
        notifier.eventsChanged(listOf(null to event("Run")))
        runCurrent()

        notifier.clearLocal()
        advanceTimeBy(2.minutes)
        runCurrent()

        assertEquals(1, port.posted.size)
        assertEquals(listOf(NotifyChannel.PartnerChanges), port.cancelled)
    }

    private companion object {
        const val ME = "member-me"
        const val PARTNER = "member-partner"
    }
}
