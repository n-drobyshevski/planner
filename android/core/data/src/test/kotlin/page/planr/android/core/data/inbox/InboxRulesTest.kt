package page.planr.android.core.data.inbox

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.data.model.TimeslotRequestStatus
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task

/** The web's test/inbox/derive.test.ts fixtures: same inputs, same rows. */
class InboxRulesTest {
    private val viewer = "viewer-1"
    private val partner = "partner-2"
    private val utc = TimeZone.UTC
    private val night = NightWindow(startHour = 20, endHour = 12)

    /** Wed 2026-06-10 15:00 UTC: afternoon, so today's wake window (ends 12:00) has passed. */
    private val now = Instant.parse("2026-06-10T15:00:00Z")

    private var seq = 0
    private val none = JsonObject(emptyMap())

    private fun occ(
        start: Instant = now - 2.hours,
        end: Instant = now - 1.hours,
        eventId: String? = null,
        title: String? = null,
        ownerId: String = viewer,
        allDay: Boolean = false,
        inactive: Boolean = false,
        kind: EventKind = EventKind.Event,
        status: EventStatus = EventStatus.Confirmed,
        attributes: JsonObject = none,
        isRecurring: Boolean = false,
    ): Occurrence {
        seq += 1
        return Occurrence(
            key = "k$seq",
            eventId = eventId ?: "e$seq",
            occurrenceDate = start,
            start = start,
            end = end,
            allDay = allDay,
            inactive = inactive,
            status = status,
            title = title ?: "Event $seq",
            description = null,
            location = null,
            categoryId = null,
            color = null,
            kind = kind,
            ownerId = ownerId,
            isPrivate = false,
            isShared = false,
            hiddenFromPublic = false,
            taskId = null,
            attributes = attributes,
            isRecurring = isRecurring,
            isException = false,
        )
    }

    private fun task(
        id: String? = null,
        title: String? = null,
        ownerId: String = viewer,
        assigneeId: String? = viewer,
        parentId: String? = null,
        completedAt: Instant? = now - 1.hours,
        attributes: JsonObject = none,
    ): Task {
        seq += 1
        return Task(
            id = id ?: "t$seq",
            workspaceId = "ws",
            ownerId = ownerId,
            assigneeId = assigneeId,
            parentId = parentId,
            collectionId = "col",
            title = title ?: "Task $seq",
            boardId = "done",
            completedAt = completedAt,
            attributes = attributes,
            createdAt = now - 1.days,
            updatedAt = now - 1.hours,
        )
    }

    private fun request(
        id: String? = null,
        createdAt: Instant = now - 1.hours,
    ): TimeslotRequest {
        seq += 1
        return TimeslotRequest(
            id = id ?: "req$seq",
            shareId = "share-1",
            workspaceId = "ws",
            ownerId = viewer,
            requesterName = "Jordan",
            message = "coffee?",
            proposedStart = now + 1.days,
            proposedEnd = now + 1.days + 1.hours,
            status = TimeslotRequestStatus.Pending,
            createdAt = createdAt,
            resolvedAt = null,
        )
    }

    /** The windows pinned so the fixtures don't drift with the defaults; sleep off unless a test sets it. */
    private fun input(
        occurrences: List<Occurrence> = emptyList(),
        tasks: List<Task> = emptyList(),
        sleepLogDates: Set<LocalDate> = emptySet(),
        requests: List<TimeslotRequest> = emptyList(),
        now: Instant = this.now,
        zone: TimeZone = utc,
        sleepWindowDays: Int = 0,
    ) = InboxInput(
        occurrences = occurrences,
        tasks = tasks,
        sleepLogDates = sleepLogDates,
        requests = requests,
        viewerId = viewer,
        now = now,
        zone = zone,
        nightWindow = night,
        rateWindowDays = 3,
        sleepWindowDays = sleepWindowDays,
    )

    private fun satisfied(value: Int) = JsonObject(mapOf("satisfaction" to JsonPrimitive(value)))

    private fun List<InboxItem>.sleepDates(): List<String> =
        filterIsInstance<InboxItem.LogSleep>().map { it.date.toString() }

    // --- rate-event --------------------------------------------------------

    @Test
    fun `surfaces the viewer's own finished, unrated, timed block`() {
        val out = InboxRules.derive(input(occurrences = listOf(occ(eventId = "ev", title = "Standup"))))
        assertEquals(
            listOf(InboxItem.RateEvent(id = out[0].id, sortAt = now - 1.hours, eventId = "ev", title = "Standup", attributes = none)),
            out,
        )
        assertEquals(InboxSeverity.Info, out[0].severity)
    }

    @Test
    fun `excludes the partner's events, all-day, inactive, context and cancelled`() {
        val out = InboxRules.derive(
            input(
                occurrences = listOf(
                    occ(ownerId = partner),
                    occ(allDay = true),
                    occ(inactive = true),
                    occ(kind = EventKind.Context),
                    occ(status = EventStatus.Cancelled),
                ),
            ),
        )
        assertEquals(emptyList(), out)
    }

    @Test
    fun `excludes already-rated, future, too-old and recurring occurrences`() {
        val out = InboxRules.derive(
            input(
                occurrences = listOf(
                    occ(attributes = satisfied(3)),
                    occ(start = now + 1.hours, end = now + 2.hours), // hasn't ended
                    occ(start = now - 5.days, end = now - 5.days + 1.hours), // older than RATE_N
                    occ(isRecurring = true), // series-level write
                ),
            ),
        )
        assertEquals(emptyList(), out)
    }

    @Test
    fun `includes a block that ended exactly at the RATE_N boundary`() {
        val out = InboxRules.derive(input(occurrences = listOf(occ(end = now - 3.days))))
        assertEquals(1, out.size)
    }

    @Test
    fun `a junk satisfaction value reads as unrated, as parseAttributes does`() {
        val junk = JsonObject(mapOf("satisfaction" to JsonPrimitive("great"), "icalUid" to JsonPrimitive("u1")))
        val out = InboxRules.derive(input(occurrences = listOf(occ(attributes = junk))))
        assertEquals(1, out.size)
    }

    // --- rate-task ---------------------------------------------------------

    @Test
    fun `surfaces a top-level task the viewer finished, still unrated`() {
        val out = InboxRules.derive(input(tasks = listOf(task(id = "tk", title = "Ship"))))
        assertEquals(
            listOf(InboxItem.RateTask(id = "rate-task:tk", sortAt = now - 1.hours, taskId = "tk", title = "Ship", attributes = none)),
            out,
        )
    }

    @Test
    fun `includes an unassigned task owned by the viewer`() {
        val out = InboxRules.derive(input(tasks = listOf(task(assigneeId = null, ownerId = viewer))))
        assertEquals(1, out.size)
    }

    @Test
    fun `excludes subtasks, rated, open, partner-done and too-old tasks`() {
        val out = InboxRules.derive(
            input(
                tasks = listOf(
                    task(parentId = "parent"),
                    task(attributes = satisfied(2)),
                    task(completedAt = null),
                    task(assigneeId = partner),
                    task(assigneeId = null, ownerId = partner),
                    task(completedAt = now - 5.days),
                    task(completedAt = now + 1.hours),
                ),
            ),
        )
        assertEquals(emptyList(), out)
    }

    // --- log-sleep ---------------------------------------------------------

    @Test
    fun `surfaces one row per recent morning lacking a log, today included once over`() {
        val out = InboxRules.derive(input(sleepWindowDays = 7))
        assertEquals(
            listOf("2026-06-10", "2026-06-09", "2026-06-08", "2026-06-07", "2026-06-06", "2026-06-05", "2026-06-04"),
            out.sleepDates(),
        )
        assertEquals("log-sleep:2026-06-10", out[0].id)
    }

    @Test
    fun `skips mornings that already have a log`() {
        val out = InboxRules.derive(
            input(sleepWindowDays = 7, sleepLogDates = setOf(LocalDate(2026, 6, 9), LocalDate(2026, 6, 7))),
        ).sleepDates()
        assertFalse("2026-06-09" in out)
        assertEquals(5, out.size)
    }

    @Test
    fun `hides today's morning until its wake-window end has passed`() {
        val before = InboxRules.derive(input(now = Instant.parse("2026-06-10T09:00:00Z"), sleepWindowDays = 7)).sleepDates()
        assertFalse("2026-06-10" in before)
        assertEquals(6, before.size) // Jun 9..4

        val after = InboxRules.derive(input(now = Instant.parse("2026-06-10T13:00:00Z"), sleepWindowDays = 7)).sleepDates()
        assertTrue("2026-06-10" in after)
    }

    @Test
    fun `applies the wake-window end in the viewer zone`() {
        // Berlin is UTC+2 in June: 09:30 UTC = 11:30 there (before 12:00), 10:30 UTC = 12:30.
        val berlin = TimeZone.of("Europe/Berlin")
        val hidden = InboxRules.derive(input(now = Instant.parse("2026-06-10T09:30:00Z"), zone = berlin, sleepWindowDays = 3))
        assertFalse("2026-06-10" in hidden.sleepDates())

        val shown = InboxRules.derive(input(now = Instant.parse("2026-06-10T10:30:00Z"), zone = berlin, sleepWindowDays = 3))
        assertTrue("2026-06-10" in shown.sleepDates())
    }

    // --- sort, stability, empty --------------------------------------------

    @Test
    fun `orders newest-first across kinds and is stable across recomputes`() {
        val args = input(
            sleepWindowDays = 2,
            occurrences = listOf(occ(end = now - 30.minutes)),
            tasks = listOf(task(completedAt = now - 6.hours)),
        )
        val a = InboxRules.derive(args)
        val b = InboxRules.derive(args)
        assertEquals(a.map { it.id }, b.map { it.id })
        a.zipWithNext { x, y -> assertTrue(x.sortAt >= y.sortAt) }
        assertTrue(a[0] is InboxItem.RateEvent)
    }

    @Test
    fun `returns nothing when there is nothing to attend to`() {
        assertEquals(emptyList(), InboxRules.derive(input()))
    }

    @Test
    fun `caps the list`() {
        val many = (1..60).map { occ(end = now - it.minutes) }
        assertEquals(InboxRules.INBOX_CAP, InboxRules.derive(input(occurrences = many)).size)
    }

    // --- request -----------------------------------------------------------

    @Test
    fun `surfaces a pending request as an attention row`() {
        val out = InboxRules.derive(input(requests = listOf(request(id = "r1"))))
        assertEquals(1, out.size)
        val row = out[0] as InboxItem.Request
        assertEquals(InboxSeverity.Attention, row.severity)
        assertEquals("r1", row.requestId)
        assertEquals("Jordan", row.requesterName)
        assertEquals("request:r1", row.id)
    }

    @Test
    fun `sorts request (attention) above rating and sleep (info) rows`() {
        val out = InboxRules.derive(
            input(
                occurrences = listOf(occ(end = now - 1.minutes, title = "Standup")),
                requests = listOf(request(createdAt = now - 5.hours)),
            ),
        )
        assertTrue(out[0] is InboxItem.Request)
        assertTrue(out.any { it is InboxItem.RateEvent })
    }

    // --- window ------------------------------------------------------------

    @Test
    fun `the occurrence window covers RATE_N days plus a buffer through the end of today`() {
        val window = InboxRules.occurrenceWindow(now, utc)
        assertEquals(Instant.parse("2026-06-06T00:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-06-11T00:00:00Z"), window.end)
        assertTrue(window.start <= now - 3.days) // every rateable end is inside
    }
}
