package page.planr.android.core.data.notify

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.TimeZone
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import page.planr.android.core.data.model.TimeslotRequestStatus

/** New time requests: what is new, how it reads (en/ru), and when it notifies. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NewRequestsTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private fun texts() = NewRequestTexts(context.resources, FixedWhenFormats)

    // --- NewRequestsPlanner ---

    @Test
    fun `only requests not seen yet notify, newest first, and the seen set follows what is pending`() {
        val old = request("r-old", created = "2026-10-05T09:00:00Z")
        val new = request("r-new", created = "2026-10-06T09:00:00Z")
        val newer = request("r-newer", created = "2026-10-06T10:00:00Z")

        val plan = NewRequestsPlanner.plan(listOf(old, new, newer), seen = setOf("r-old", "r-gone"))

        assertEquals(listOf("r-newer", "r-new"), plan.toNotify.map { it.id })
        assertEquals(setOf("r-newer", "r-new", "r-old"), plan.newSeen, "r-gone is no longer pending: pruned")
    }

    @Test
    fun `resolved requests never notify`() {
        val plan = NewRequestsPlanner.plan(listOf(request("r1", status = TimeslotRequestStatus.Declined)), seen = emptySet())
        assertEquals(emptyList(), plan.toNotify)
        assertEquals(emptySet(), plan.newSeen)
    }

    @Test
    fun `the seen set is capped to the newest, and older pending ones are left out for good`() {
        val many = (0 until NewRequestsPlanner.SEEN_CAP + 5).map { i ->
            request("r$i", created = "2026-10-06T09:%02d:%02dZ".format(i / 60, i % 60))
        }
        val primed = NewRequestsPlanner.prime(many)
        assertEquals(NewRequestsPlanner.SEEN_CAP, primed.size)
        assertTrue("r${NewRequestsPlanner.SEEN_CAP + 4}" in primed, "the newest is kept")

        val plan = NewRequestsPlanner.plan(many, primed)
        assertEquals(emptyList(), plan.toNotify, "the oldest five never notify late")
    }

    // --- NewRequestTexts ---

    @Test
    fun `a single request names who asked and when, in the member's zone`() {
        val content = texts().content(listOf(request("r1")), berlin)

        assertEquals("New time request", content.title)
        assertEquals("Anna asked for Wed 7 Oct, 14:00–15:00", content.text)
        assertEquals(NotifyTarget.Inbox, content.target)
        assertEquals(NotifyChannel.TimeRequests, content.channel)
        assertEquals("r1".hashCode(), content.id)
    }

    @Test
    fun `an anonymous request, and one spanning midnight`() {
        val line = texts().line(request("r1", name = "  ", start = "2026-10-07T21:00:00Z", end = "2026-10-07T23:00:00Z"), berlin)
        assertEquals("Someone asked for Wed 7 Oct, 23:00 – Thu 8 Oct, 01:00", line)
    }

    @Test
    fun `several requests are one summary listing up to five`() {
        val requests = (1..7).map { request("r$it", name = "P$it") }

        val content = texts().content(requests, berlin)

        assertEquals("7 new time requests", content.title)
        assertEquals("P1 asked for Wed 7 Oct, 14:00–15:00", content.text)
        assertEquals(5, content.lines.size)
        assertEquals(2, content.more)
        assertEquals(NewRequestTexts.summaryId(requests.first()), content.id)
    }

    @Test
    fun `each summary has its own id, so a later batch alerts again and leaves the earlier one showing`() {
        val t = texts()
        val first = t.content(listOf(request("b"), request("c")), berlin)
        val second = t.content(listOf(request("d"), request("e")), berlin)

        assertNotEquals(first.id, second.id)
        assertNotEquals("b".hashCode(), first.id, "nor a single request's notification")
    }

    @Test
    @Config(qualifiers = "ru")
    fun `russian counts requests with its plural forms`() {
        val t = texts()
        assertEquals("2 новых запроса на время", t.content((1..2).map { request("r$it") }, berlin).title)
        assertEquals("5 новых запросов на время", t.content((1..5).map { request("r$it") }, berlin).title)
        assertEquals("21 новый запрос на время", t.content((1..21).map { request("r$it") }, berlin).title)
        assertEquals("Анна просит время: Wed 7 Oct, 14:00–15:00", t.line(request("r1", name = "Анна"), berlin))
        assertEquals("Новый запрос на время", t.content(listOf(request("r1")), berlin).title)
    }

    // --- NewRequestNotifier ---

    private val prefs = FakeNotifyPrefs(newRequests = true)
    private val requests = FakeTimeslotRequests()
    private val port = FakeNotificationPort()
    private var foreground = false

    private fun TestScope.notifier() = NewRequestNotifier(
        prefs = prefs,
        requests = requests,
        audience = { NotifyViewer("me", berlin, null, "partner", "Boris") },
        port = port,
        foreground = { foreground },
        texts = texts(),
        scope = backgroundScope,
    )

    @Test
    fun `the first check after turning it on marks the backlog seen without notifying`() = runTest {
        val notifier = notifier()

        notifier.check(listOf(request("r1"), request("r2")))
        assertEquals(emptyList(), port.posted)
        assertEquals(setOf("r1", "r2"), prefs.seen)

        notifier.check(listOf(request("r1"), request("r2"), request("r3", created = "2026-10-06T11:00:00Z")))
        assertEquals(listOf("New time request"), port.posted.map { it.title })
        assertEquals(setOf("r1", "r2", "r3"), prefs.seen)

        notifier.check(listOf(request("r1"), request("r2"), request("r3", created = "2026-10-06T11:00:00Z")))
        assertEquals(1, port.posted.size, "each request notifies once")
    }

    @Test
    fun `a second batch while the first is unread posts a notification of its own`() = runTest {
        prefs.seen = emptySet()
        val notifier = notifier()
        val b = request("b", created = "2026-10-06T10:00:00Z")
        val c = request("c", created = "2026-10-06T10:01:00Z")

        notifier.check(listOf(b, c))
        notifier.check(listOf(b, c, request("d", created = "2026-10-06T12:00:00Z"), request("e", created = "2026-10-06T12:01:00Z")))

        assertEquals(listOf("2 new time requests", "2 new time requests"), port.posted.map { it.title })
        assertEquals(2, port.posted.map { it.id }.toSet().size, "the second never silently replaces the first")
    }

    @Test
    fun `in the foreground nothing notifies, but what arrived is seen`() = runTest {
        prefs.seen = emptySet()
        foreground = true
        val notifier = notifier()

        notifier.check(listOf(request("r1")))
        assertEquals(emptyList(), port.posted)
        assertEquals(setOf("r1"), prefs.seen)

        foreground = false
        notifier.check(listOf(request("r1")))
        assertEquals(emptyList(), port.posted, "not later either")
    }

    @Test
    fun `off, or with notifications blocked, nothing posts`() = runTest {
        prefs.seen = emptySet()
        port.allowed = false
        notifier().check(listOf(request("r1")))
        assertEquals(emptyList(), port.posted)

        prefs.newRequests.value = false
        prefs.seen = emptySet()
        port.allowed = true
        notifier().check(listOf(request("r2")))
        assertEquals(emptyList(), port.posted)
        assertEquals(emptySet(), prefs.seen, "untouched while off")
    }

    @Test
    fun `started, it follows the Inbox's list, refreshing it once on`() = runTest {
        prefs.seen = emptySet()
        requests.server = listOf(request("r1"))
        val notifier = notifier()

        notifier.start()
        runCurrent()
        assertEquals(listOf(false), requests.refreshes, "not forced: a refresh done moments ago is enough")
        assertEquals(1, port.posted.size)
        assertTrue(NotifyChannel.TimeRequests in port.channels)

        requests.pending.value = listOf(request("r1"), request("r2", name = "Boris", created = "2026-10-06T10:00:00Z"))
        runCurrent()
        assertEquals("Boris asked for Wed 7 Oct, 14:00–15:00", port.posted.last().text)
    }

    @Test
    fun `the background check fetches and notifies`() = runTest {
        prefs.seen = emptySet()
        requests.server = listOf(request("r1"))

        notifier().checkInBackground()

        assertEquals(listOf(false), requests.refreshes)
        assertEquals(1, port.posted.size)
    }

    @Test
    fun `sign-out forgets what was seen and takes down what shows`() = runTest {
        prefs.seen = setOf("r1")

        notifier().clearLocal()

        assertNull(prefs.seen)
        assertEquals(listOf(NotifyChannel.TimeRequests), port.cancelled)
    }
}
