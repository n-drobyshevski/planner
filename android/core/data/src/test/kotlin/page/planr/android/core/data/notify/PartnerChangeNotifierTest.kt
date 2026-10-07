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
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
    fun `one change is one sentence`() {
        val d = digest()
        assertEquals(
            "Anna moved Dinner to 19:30",
            d.sentence("Anna", change(Kind.Moved, start = dinner + 30.minutes, previous = dinner), berlin),
        )
        assertEquals(
            "Anna moved Dinner to Thu 8 Oct, 19:00",
            d.sentence("Anna", change(Kind.Moved, start = dinner + 24.hours, previous = dinner), berlin),
            "to another day: the day too",
        )
        assertEquals("Anna added Gym, Thu 8 Oct, 18:00", d.sentence("Anna", change(Kind.Added, "Gym", Instant.parse("2026-10-08T16:00:00Z")), berlin))
        assertEquals("Anna removed Dinner (Wed 7 Oct, 19:00)", d.sentence("Anna", change(Kind.Removed), berlin))
        assertEquals("Anna cancelled Dinner (Wed 7 Oct, 19:00)", d.sentence("Anna", change(Kind.Cancelled), berlin))
        assertEquals(
            "Anna added Trip, Thu 8 Oct",
            d.sentence("Anna", change(Kind.Added, "Trip", Instant.parse("2026-10-08T00:00:00Z"), allDay = true), berlin),
        )
    }

    @Test
    fun `a single change's notification is its sentence, opening its day`() {
        val content = digest().content("Anna", listOf(change(Kind.Removed)), berlin, id = 7)

        assertEquals("Anna removed Dinner (Wed 7 Oct, 19:00)", content.title)
        assertEquals("", content.text)
        assertEquals(NotifyTarget.Day(LocalDate(2026, 10, 7)), content.target)
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
        assertEquals("Your partner removed Dinner (Wed 7 Oct, 19:00)", digest().content(null, listOf(change(Kind.Removed)), berlin, 1).title)
    }

    @Test
    @Config(qualifiers = "ru")
    fun `russian reads the same changes without a gendered verb, and counts them`() {
        val d = digest()
        assertEquals("Анна: событие «Ужин» перенесено на 19:30", d.sentence("Анна", change(Kind.Moved, "Ужин", dinner + 30.minutes, dinner), berlin))
        assertEquals("Анна: новое событие «Спорт», Wed 7 Oct, 19:00", d.sentence("Анна", change(Kind.Added, "Спорт"), berlin))
        assertEquals("Анна: событие «Ужин» удалено (Wed 7 Oct, 19:00)", d.sentence("Анна", change(Kind.Removed, "Ужин"), berlin))

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

    private fun TestScope.notifier(): PartnerChangeNotifier {
        val clock = object : Clock {
            // The test scheduler's virtual time, from 09:00.
            override fun now(): Instant = Instant.parse("2026-10-07T09:00:00Z") + testScheduler.currentTime.milliseconds
        }
        return PartnerChangeNotifier(
            prefs = prefs,
            audience = { NotifyAudience { NotifyViewer(ME, berlin, null, PARTNER, "Anna") } },
            port = port,
            foreground = { foreground },
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
        assertEquals(listOf("Anna added Gym, Wed 7 Oct, 19:00"), port.posted.map { it.title })

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
