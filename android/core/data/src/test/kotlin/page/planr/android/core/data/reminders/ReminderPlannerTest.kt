package page.planr.android.core.data.reminders

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.recurrence.DefaultRecurrenceExpander

/** Anna's reminders in Berlin (UTC+2 in October, UTC+1 in winter). */
class ReminderPlannerTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val now = Instant.parse("2026-10-06T08:00:00Z") // 10:00 in Berlin

    private fun plan(
        occurrences: List<Occurrence>,
        at: Instant = now,
        lead: ReminderLead = ReminderLead.Ten,
        sleepCategoryId: String? = null,
    ) = ReminderPlanner.plan(occurrences, at, lead.duration, berlin, ANNA, sleepCategoryId)

    @Test
    fun `a timed event of the viewer's is reminded lead minutes before, with its local times`() {
        val alarms = plan(listOf(occurrence("standup", "2026-10-06T08:30:00Z", "2026-10-06T09:15:00Z", title = "Standup")))

        assertEquals(
            listOf(
                ReminderAlarm(
                    id = ReminderPlanner.requestCode("standup", Instant.parse("2026-10-06T08:30:00Z")),
                    key = "standup",
                    eventId = "standup",
                    occurrenceStart = Instant.parse("2026-10-06T08:30:00Z"),
                    triggerAt = Instant.parse("2026-10-06T08:20:00Z"),
                    title = "Standup",
                    timeText = "10:30–11:15",
                ),
            ),
            alarms,
        )
    }

    @Test
    fun `joint events are reminded, the partner's personal ones are not`() {
        val alarms = plan(
            listOf(
                occurrence("joint", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z", owner = BORIS, isShared = true),
                occurrence("his", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z", owner = BORIS),
            ),
        )
        assertEquals(listOf("joint"), alarms.map { it.key })
    }

    @Test
    fun `all-day, contexts, cancelled and sleep are left out`() {
        val alarms = plan(
            listOf(
                occurrence("allday", "2026-10-07T00:00:00Z", "2026-10-08T00:00:00Z", allDay = true),
                occurrence("context", "2026-10-06T09:00:00Z", "2026-10-06T15:00:00Z", kind = EventKind.Context),
                occurrence("cancelled", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z", status = EventStatus.Cancelled),
                occurrence("night", "2026-10-06T20:00:00Z", "2026-10-07T05:00:00Z", inactive = true),
                occurrence("planned", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z", status = EventStatus.Planned),
            ),
        )
        assertEquals(listOf("planned"), alarms.map { it.key })
    }

    @Test
    fun `with a sleep category, only that category counts as sleep`() {
        val sleep = occurrence("sleep", "2026-10-06T20:00:00Z", "2026-10-07T05:00:00Z", categoryId = "cat-sleep")
        val focus = occurrence("focus", "2026-10-06T12:00:00Z", "2026-10-06T14:00:00Z", inactive = true)

        assertEquals(listOf("focus"), plan(listOf(sleep, focus), sleepCategoryId = "cat-sleep").map { it.key })
        // Without one, inactive blocks are the nights (and a block in a category is just an event).
        assertEquals(listOf("sleep"), plan(listOf(sleep, focus), sleepCategoryId = null).map { it.key })
        // The partner's block in "my" sleep category is not my sleep, but it isn't shared either.
        assertTrue(ReminderPlanner.isRemindable(sleep.copy(ownerId = BORIS, isShared = true), ANNA, "cat-sleep"))
        assertFalse(ReminderPlanner.isRemindable(sleep, ANNA, "cat-sleep"))
    }

    @Test
    fun `only the next 24 hours, and never a trigger already past`() {
        val alarms = plan(
            listOf(
                occurrence("started", "2026-10-06T07:30:00Z", "2026-10-06T09:00:00Z"),
                occurrence("in-5", "2026-10-06T08:05:00Z", "2026-10-06T09:00:00Z"),
                occurrence("in-10", "2026-10-06T08:10:00Z", "2026-10-06T09:00:00Z"),
                occurrence("in-11", "2026-10-06T08:11:00Z", "2026-10-06T09:00:00Z"),
                occurrence("tomorrow", "2026-10-07T08:00:00Z", "2026-10-07T09:00:00Z"),
                occurrence("later", "2026-10-07T08:01:00Z", "2026-10-07T09:00:00Z"),
            ),
        )
        assertEquals(listOf("in-11", "tomorrow"), alarms.map { it.key })
        assertEquals(Instant.parse("2026-10-06T08:01:00Z"), alarms.first().triggerAt)
    }

    @Test
    fun `alarms come sorted by trigger`() {
        val alarms = plan(
            listOf(
                occurrence("b", "2026-10-06T12:00:00Z", "2026-10-06T13:00:00Z"),
                occurrence("a", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z"),
            ),
        )
        assertEquals(listOf("a", "b"), alarms.map { it.key })
    }

    @Test
    fun `a zero-length event shows one time`() {
        val alarm = plan(listOf(occurrence("call", "2026-10-06T09:00:00Z", "2026-10-06T09:00:00Z"))).single()
        assertEquals("11:00", alarm.timeText)
    }

    @Test
    fun `Off plans nothing`() {
        assertEquals(emptyList(), plan(listOf(occurrence("a", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z")), lead = ReminderLead.Off))
    }

    @Test
    fun `a different lead moves the trigger but keeps the id`() {
        val event = listOf(occurrence("a", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z"))
        val five = plan(event, lead = ReminderLead.Five).single()
        val thirty = plan(event, lead = ReminderLead.Thirty).single()

        assertEquals(five.id, thirty.id)
        assertEquals(Instant.parse("2026-10-06T08:55:00Z"), five.triggerAt)
        assertEquals(Instant.parse("2026-10-06T08:30:00Z"), thirty.triggerAt)
        // 30 minutes before an event 40 minutes away is still ahead; 30 before one 25 away is not.
        val soon = listOf(occurrence("soon", "2026-10-06T08:25:00Z", "2026-10-06T09:00:00Z"))
        assertEquals(1, plan(soon, lead = ReminderLead.Fifteen).size)
        assertEquals(0, plan(soon, lead = ReminderLead.Thirty).size)
    }

    @Test
    fun `each occurrence of a series gets its own stable id`() {
        // 09:00 and 18:00 in Berlin, every day: tonight's and tomorrow morning's are both ahead.
        val twiceDaily = event("meds", "2026-10-05T07:00:00Z", "2026-10-05T07:15:00Z", rrule = "FREQ=DAILY;BYHOUR=9,18")

        val alarms = plan(expand(listOf(twiceDaily), emptyList(), ReminderPlanner.window(now)))

        assertEquals(
            listOf(Instant.parse("2026-10-06T15:50:00Z"), Instant.parse("2026-10-07T06:50:00Z")),
            alarms.map { it.triggerAt },
        )
        assertEquals(listOf("18:00–18:15", "09:00–09:15"), alarms.map { it.timeText })
        assertEquals(2, alarms.map { it.id }.toSet().size, "distinct ids")
        assertTrue(alarms.all { it.eventId == "meds" && it.key.startsWith("meds:") })
        assertEquals(alarms, plan(expand(listOf(twiceDaily), emptyList(), ReminderPlanner.window(now))), "the same plan twice")
    }

    @Test
    fun `a moved occurrence is reminded at its new time, under a new id`() {
        val daily = event("yoga", "2026-10-05T16:00:00Z", "2026-10-05T17:00:00Z", rrule = "FREQ=DAILY")
        val original = Instant.parse("2026-10-06T16:00:00Z")
        val moved = EventOverride(
            id = "ov-1",
            workspaceId = WS,
            eventId = "yoga",
            occurrenceDate = original,
            type = OverrideType.Modify,
            title = "Yoga (late)",
            start = Instant.parse("2026-10-06T18:00:00Z"),
            end = Instant.parse("2026-10-06T19:00:00Z"),
        )
        val before = plan(expand(listOf(daily), emptyList(), ReminderPlanner.window(now))).first()
        val after = plan(expand(listOf(daily), listOf(moved), ReminderPlanner.window(now))).first()

        assertEquals("yoga:${original.toEpochMilliseconds()}", after.key, "the key keeps the original start")
        assertEquals(Instant.parse("2026-10-06T17:50:00Z"), after.triggerAt)
        assertEquals("Yoga (late)", after.title)
        assertEquals("20:00–21:00", after.timeText)
        assertNotEquals(before.id, after.id)
    }

    @Test
    fun `a cancelled occurrence of a series is not reminded`() {
        val twiceDaily = event("meds", "2026-10-05T07:00:00Z", "2026-10-05T07:15:00Z", rrule = "FREQ=DAILY;BYHOUR=9,18")
        val skip = EventOverride(
            id = "ov-2",
            workspaceId = WS,
            eventId = "meds",
            occurrenceDate = Instant.parse("2026-10-06T16:00:00Z"),
            type = OverrideType.Cancel,
        )
        val alarms = plan(expand(listOf(twiceDaily), listOf(skip), ReminderPlanner.window(now)))
        assertEquals(listOf(Instant.parse("2026-10-07T06:50:00Z")), alarms.map { it.triggerAt })
    }

    @Test
    fun `across the autumn DST change a daily 09-00 stays 09-00 and its trigger follows`() {
        // Berlin leaves summer time on 25 Oct 2026 at 03:00 CEST: 09:00 is 07:00Z before, 08:00Z after.
        val daily = event("run", "2026-10-20T07:00:00Z", "2026-10-20T08:00:00Z", rrule = "FREQ=DAILY", zone = "Europe/Berlin")
        val saturday = Instant.parse("2026-10-24T10:00:00Z")

        val alarms = plan(expand(listOf(daily), emptyList(), ReminderPlanner.window(saturday)), at = saturday)

        val alarm = alarms.single()
        assertEquals(Instant.parse("2026-10-25T08:00:00Z"), alarm.occurrenceStart)
        assertEquals(Instant.parse("2026-10-25T07:50:00Z"), alarm.triggerAt)
        assertEquals("09:00–10:00", alarm.timeText)
    }

    @Test
    fun `the 24 hours are real hours on a short day`() {
        // Spring forward, 29 Mar 2026: 23 hours from Saturday 10:00 CET reach Sunday 10:00 CEST.
        val saturday = Instant.parse("2026-03-28T09:00:00Z") // 10:00 CET
        val sundayTen = occurrence("brunch", "2026-03-29T08:00:00Z", "2026-03-29T09:00:00Z") // 10:00 CEST
        val sundayEleven = occurrence("walk", "2026-03-29T09:00:00Z", "2026-03-29T10:00:00Z") // 11:00 CEST, 24 h on

        val alarms = plan(listOf(sundayTen, sundayEleven), at = saturday)

        assertEquals(listOf("brunch", "walk"), alarms.map { it.key })
        assertEquals(listOf("10:00–11:00", "11:00–12:00"), alarms.map { it.timeText })
    }

    @Test
    fun `ids depend only on the event and its start`() {
        val start = Instant.parse("2026-10-06T09:00:00Z")
        assertEquals(ReminderPlanner.requestCode("a", start), ReminderPlanner.requestCode("a", start))
        assertNotEquals(ReminderPlanner.requestCode("a", start), ReminderPlanner.requestCode("a", start + 1.minutes))
        assertNotEquals(ReminderPlanner.requestCode("a", start), ReminderPlanner.requestCode("b", start))
    }

    @Test
    fun `lead minutes read back, unknown ones as Off`() {
        assertEquals(ReminderLead.Fifteen, ReminderLead.fromMinutes(15))
        assertEquals(ReminderLead.Off, ReminderLead.fromMinutes(null))
        assertEquals(ReminderLead.Off, ReminderLead.fromMinutes(0))
        assertEquals(ReminderLead.Off, ReminderLead.fromMinutes(7))
    }

    private fun expand(events: List<PlannerEvent>, overrides: List<EventOverride>, window: TimeWindow) =
        DefaultRecurrenceExpander.expand(events, overrides, window)

    private companion object {
        const val WS = "ws-1"
        const val ANNA = "member-a"
        const val BORIS = "member-b"
        val created: Instant = Instant.parse("2026-09-01T08:00:00Z")

        fun event(id: String, start: String, end: String, rrule: String? = null, zone: String = "Europe/Berlin") = PlannerEvent(
            id = id,
            workspaceId = WS,
            ownerId = ANNA,
            title = id,
            start = Instant.parse(start),
            end = Instant.parse(end),
            timeZone = zone,
            rrule = rrule,
            createdAt = created,
            updatedAt = created,
        )

        fun occurrence(
            key: String,
            start: String,
            end: String,
            title: String = key,
            owner: String = ANNA,
            allDay: Boolean = false,
            isShared: Boolean = false,
            kind: EventKind = EventKind.Event,
            status: EventStatus = EventStatus.Confirmed,
            inactive: Boolean = false,
            categoryId: String? = null,
        ) = Occurrence(
            key = key,
            eventId = key.substringBefore(':'),
            occurrenceDate = Instant.parse(start),
            start = Instant.parse(start),
            end = Instant.parse(end),
            allDay = allDay,
            inactive = inactive,
            status = status,
            title = title,
            description = null,
            location = null,
            categoryId = categoryId,
            color = null,
            kind = kind,
            ownerId = owner,
            isPrivate = false,
            isShared = isShared,
            hiddenFromPublic = false,
            taskId = null,
            attributes = JsonObject(emptyMap()),
            isRecurring = key.contains(':'),
            isException = false,
        )
    }
}
