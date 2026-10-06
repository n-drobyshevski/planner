package page.planr.android.core.data.reminders

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

class ReminderSchedulerTest {
    private val clock = MutableClock(Instant.parse("2026-10-06T08:00:00Z")) // 10:00 in Berlin
    private val source = FakeReminderSource()
    private val store = InMemoryReminderStore(ReminderLead.Ten)
    private val alarms = FakeAlarmPort()

    private fun scheduler() = ReminderScheduler(source, store, alarms, clock)

    private val standup = occurrence("standup", "2026-10-06T08:30:00Z", "2026-10-06T09:00:00Z")
    private val lunch = occurrence("lunch", "2026-10-06T10:00:00Z", "2026-10-06T11:00:00Z")

    @Test
    fun `the first plan in a process arms everything, the next ones only what changed`() = runTest {
        source.occurrences = listOf(standup, lunch)
        val scheduler = scheduler()

        scheduler.replan()
        assertEquals(listOf("standup", "lunch"), alarms.armed.values.map { it.key })
        assertEquals(2, alarms.sets)

        scheduler.replan()
        assertEquals(2, alarms.sets, "nothing changed, nothing re-armed")

        source.occurrences = listOf(standup, lunch.copy(title = "Lunch with Boris"))
        scheduler.replan()
        assertEquals(3, alarms.sets)
        assertEquals("Lunch with Boris", alarms.armed.getValue(id(lunch)).title)
        assertEquals(store.scheduled(), alarms.armed.values.toList())
    }

    @Test
    fun `a new process re-arms what the last one armed, since a reboot clears alarms`() = runTest {
        source.occurrences = listOf(standup)
        scheduler().replan()
        alarms.armed.clear() // rebooted

        scheduler().replan()

        assertEquals(listOf("standup"), alarms.armed.values.map { it.key })
    }

    @Test
    fun `each plan arms the next one, so the horizon moves on without a sync`() = runTest {
        // Tomorrow 14:00 is past today's horizon; offline, only the re-plan alarm reaches it.
        val tomorrow = occurrence("tomorrow", "2026-10-07T12:00:00Z", "2026-10-07T13:00:00Z")
        source.occurrences = listOf(lunch, tomorrow)
        val scheduler = scheduler()

        scheduler.replan()
        assertEquals(listOf("lunch"), alarms.armed.values.map { it.key })
        assertEquals(clock.now + ReminderPlanner.REPLAN_AFTER, alarms.replanAt)

        clock.now = alarms.replanAt!! // the re-plan alarm went off, no network since
        scheduler.replan()

        assertEquals(listOf("tomorrow"), store.scheduled().map { it.key })
        assertEquals(Instant.parse("2026-10-07T11:50:00Z"), alarms.armed.getValue(id(tomorrow)).triggerAt)
        assertEquals(Instant.parse("2026-10-07T08:00:00Z"), alarms.replanAt)
    }

    @Test
    fun `no re-plan alarm while reminders are off or no one is signed in`() = runTest {
        val scheduler = scheduler()
        scheduler.replan()
        assertNotNull(alarms.replanAt)

        scheduler.setLead(ReminderLead.Off)
        assertNull(alarms.replanAt, "off")

        scheduler.setLead(ReminderLead.Ten)
        assertNotNull(alarms.replanAt)
        source.viewer = null
        scheduler.replan()
        assertNull(alarms.replanAt, "signed out")

        source.viewer = ReminderViewer(ANNA, TimeZone.of("Europe/Berlin"), sleepCategoryId = null)
        scheduler.replan()
        scheduler.clearLocal()
        assertNull(alarms.replanAt, "sign-out wipe")
    }

    @Test
    fun `a deleted or moved event's alarm is cancelled, a moved one armed anew`() = runTest {
        source.occurrences = listOf(standup, lunch)
        val scheduler = scheduler()
        scheduler.replan()

        val moved = lunch.copy(start = Instant.parse("2026-10-06T12:00:00Z"), end = Instant.parse("2026-10-06T13:00:00Z"))
        source.occurrences = listOf(moved)
        scheduler.replan()

        assertEquals(setOf(id(standup), id(lunch)), alarms.cancelled.toSet())
        assertEquals(listOf(Instant.parse("2026-10-06T11:50:00Z")), alarms.armed.values.map { it.triggerAt })
    }

    @Test
    fun `an alarm already due is left to its receiver, not cancelled`() = runTest {
        source.occurrences = listOf(standup)
        val scheduler = scheduler()
        scheduler.replan()

        clock.now = Instant.parse("2026-10-06T08:21:00Z") // the trigger (08:20) has passed; delivery may lag
        scheduler.replan()

        assertEquals(emptyList(), alarms.cancelled)
        assertEquals(emptyList(), store.scheduled(), "and no longer tracked")
    }

    @Test
    fun `a different lead re-arms the same ids at new times`() = runTest {
        source.occurrences = listOf(lunch)
        val scheduler = scheduler()
        scheduler.replan()

        scheduler.setLead(ReminderLead.Thirty)

        assertEquals(listOf(id(lunch)), alarms.armed.keys.toList())
        assertEquals(Instant.parse("2026-10-06T09:30:00Z"), alarms.armed.getValue(id(lunch)).triggerAt)
        assertEquals(emptyList(), alarms.cancelled)
    }

    @Test
    fun `turning reminders off cancels them all, snoozes too`() = runTest {
        source.occurrences = listOf(standup, lunch)
        val scheduler = scheduler()
        scheduler.replan()
        scheduler.snooze(alarms.armed.getValue(id(standup)))

        scheduler.setLead(ReminderLead.Off)

        assertEquals(emptyMap(), alarms.armed)
        assertEquals(emptyMap(), alarms.snoozed)
        assertEquals(emptyList(), store.snoozed())
        assertEquals(1, source.viewerReads, "Off never reads the viewer")
    }

    @Test
    fun `signed out plans nothing`() = runTest {
        source.occurrences = listOf(standup)
        val scheduler = scheduler()
        scheduler.replan()

        source.viewer = null
        scheduler.replan()

        assertEquals(emptyMap(), alarms.armed)
    }

    @Test
    fun `sign-out cancels every alarm and takes down shown reminders`() = runTest {
        source.occurrences = listOf(standup, lunch)
        val scheduler = scheduler()
        scheduler.replan()
        scheduler.snooze(alarms.armed.getValue(id(lunch)))

        scheduler.clearLocal()

        assertEquals(emptyMap(), alarms.armed)
        assertEquals(emptyMap(), alarms.snoozed)
        assertTrue(alarms.dismissed)
        assertEquals(emptyList(), store.scheduled())
        assertEquals(ReminderLead.Ten, store.leadValue.value, "the device's setting stays")
    }

    @Test
    fun `a snooze shows the reminder again ten minutes on and survives re-plans`() = runTest {
        source.occurrences = listOf(standup)
        val scheduler = scheduler()
        scheduler.replan()
        clock.now = Instant.parse("2026-10-06T08:20:00Z")
        val shown = scheduler.due(alarms.armed.getValue(id(standup)), snoozed = false)!!

        scheduler.snooze(shown)
        scheduler.replan()

        assertEquals(Instant.parse("2026-10-06T08:30:00Z"), alarms.snoozed.getValue(id(standup)).triggerAt)
        assertEquals(listOf(id(standup)), store.snoozed().map { it.id })

        alarms.snoozed.clear() // rebooted before it fired
        scheduler().replan()
        assertEquals(listOf(id(standup)), alarms.snoozed.keys.toList())

        clock.now = Instant.parse("2026-10-06T08:30:00Z")
        assertNotNull(scheduler.due(alarms.snoozed.getValue(id(standup)), snoozed = true))
        assertEquals(emptyList(), store.snoozed(), "fired, so forgotten")
    }

    @Test
    fun `a due alarm shows the event as it is now`() = runTest {
        source.occurrences = listOf(standup)
        val scheduler = scheduler()
        scheduler.replan()
        val armed = alarms.armed.getValue(id(standup))

        source.occurrences = listOf(standup.copy(title = "Standup (short)", end = Instant.parse("2026-10-06T08:45:00Z")))
        clock.now = armed.triggerAt

        val due = scheduler.due(armed, snoozed = false)!!
        assertEquals("Standup (short)", due.title)
        assertEquals("10:30–10:45", due.timeText)
        assertEquals(armed.triggerAt, due.triggerAt)
    }

    @Test
    fun `a due alarm for an event since deleted, cancelled, moved or over shows nothing`() = runTest {
        source.occurrences = listOf(standup)
        val scheduler = scheduler()
        scheduler.replan()
        val armed = alarms.armed.getValue(id(standup))
        clock.now = armed.triggerAt

        source.occurrences = emptyList()
        assertNull(scheduler.due(armed, snoozed = false), "deleted")

        source.occurrences = listOf(standup.copy(status = EventStatus.Cancelled))
        assertNull(scheduler.due(armed, snoozed = false), "cancelled")

        source.occurrences = listOf(standup.copy(start = standup.start + 1.minutes))
        assertNull(scheduler.due(armed, snoozed = false), "moved: its new alarm will show")

        source.occurrences = listOf(standup)
        clock.now = standup.end
        assertNull(scheduler.due(armed, snoozed = false), "over")

        clock.now = armed.triggerAt
        store.leadValue.value = ReminderLead.Off
        assertNull(scheduler.due(armed, snoozed = false), "reminders off")

        store.leadValue.value = ReminderLead.Ten
        source.viewer = null
        assertNull(scheduler.due(armed, snoozed = false), "signed out")
    }

    @Test
    fun `a planned alarm delivered long after the start shows nothing, a snooze shows while the event runs`() = runTest {
        source.occurrences = listOf(standup) // 08:30–09:00
        val scheduler = scheduler()
        scheduler.replan()
        val armed = alarms.armed.getValue(id(standup))

        // Held back by Doze, or fired at once by the clock jumping ahead.
        clock.now = Instant.parse("2026-10-06T08:44:00Z")
        assertNotNull(scheduler.due(armed, snoozed = false), "within the slack")
        clock.now = Instant.parse("2026-10-06T08:46:00Z")
        assertNull(scheduler.due(armed, snoozed = false), "stale")
        assertNotNull(scheduler.due(armed, snoozed = true), "asked for")
    }

    @Test
    fun `a sleep category from Settings is remembered and re-plans at once`() = runTest {
        val night = standup.copy(categoryId = "cat-sleep")
        source.occurrences = listOf(night, lunch)
        val scheduler = scheduler()
        scheduler.replan()
        assertEquals(2, alarms.armed.size)

        scheduler.sleepCategoryChanged(ANNA, "cat-sleep")

        assertEquals(listOf<String?>("cat-sleep"), source.rememberedSleep)
        assertEquals(listOf(id(lunch)), alarms.armed.keys.toList())
        assertEquals(listOf(id(night)), alarms.cancelled)
    }

    @Test
    fun `the diff sets new and changed alarms and cancels only future ones no longer planned`() {
        val now = Instant.parse("2026-10-06T08:00:00Z")
        val a = alarm(1, now + 5.minutes)
        val b = alarm(2, now + 10.minutes)
        val past = alarm(3, now - 1.minutes)
        val c = alarm(4, now + 20.minutes)

        val diff = ReminderDiff.between(listOf(a, b, past), listOf(a, b.copy(title = "new"), c), now, rearmAll = false)

        assertEquals(listOf(b.copy(title = "new"), c), diff.set)
        assertEquals(emptyList(), diff.cancel)
        assertEquals(listOf(1, 2), ReminderDiff.between(listOf(a, b, past), emptyList(), now, rearmAll = false).cancel)
        assertEquals(listOf(a, c), ReminderDiff.between(listOf(a), listOf(a, c), now, rearmAll = true).set)
    }

    private fun id(o: Occurrence) = ReminderPlanner.requestCode(o.eventId, o.start)

    private fun alarm(id: Int, trigger: Instant) = ReminderAlarm(id, "k$id", "e$id", trigger + 10.minutes, trigger, "t$id", "")

    private companion object {
        const val ANNA = "member-a"

        fun occurrence(key: String, start: String, end: String) = Occurrence(
            key = key, eventId = key, occurrenceDate = Instant.parse(start), start = Instant.parse(start),
            end = Instant.parse(end), allDay = false, inactive = false, status = EventStatus.Confirmed, title = key,
            description = null, location = null, categoryId = null, color = null, kind = EventKind.Event,
            ownerId = ANNA, isPrivate = false, isShared = false, hiddenFromPublic = false, taskId = null,
            attributes = JsonObject(emptyMap()), isRecurring = false, isException = false,
        )
    }
}

class MutableClock(var now: Instant) : Clock {
    override fun now(): Instant = now
}

/** AlarmManager as a map: what is armed now, and every set / cancel. */
class FakeAlarmPort : AlarmPort {
    val armed = linkedMapOf<Int, ReminderAlarm>()
    val snoozed = linkedMapOf<Int, ReminderAlarm>()
    val cancelled = mutableListOf<Int>()
    var sets = 0
    var dismissed = false

    /** When the scheduler's own re-plan alarm goes off; null when none is armed. */
    var replanAt: Instant? = null

    override fun set(alarm: ReminderAlarm, snoozed: Boolean) {
        if (snoozed) this.snoozed[alarm.id] = alarm else armed[alarm.id] = alarm
        sets++
    }

    override fun cancel(id: Int, snoozed: Boolean) {
        if (snoozed) {
            this.snoozed.remove(id)
        } else {
            armed.remove(id)
            cancelled += id
        }
    }

    override fun setReplan(at: Instant) {
        replanAt = at
    }

    override fun cancelReplan() {
        replanAt = null
    }

    override fun dismissShown() {
        dismissed = true
    }
}

/** Anna in Berlin, reading [occurrences] (filtered to the window like Room's query). */
class FakeReminderSource : ReminderSource {
    var viewer: ReminderViewer? = ReminderViewer("member-a", TimeZone.of("Europe/Berlin"), sleepCategoryId = null)
    var occurrences: List<Occurrence> = emptyList()
    var viewerReads = 0
    val rememberedSleep = mutableListOf<String?>()

    override suspend fun viewer(): ReminderViewer? {
        viewerReads++
        return viewer
    }

    override suspend fun occurrences(window: TimeWindow, zone: TimeZone): List<Occurrence> =
        occurrences.filter { o -> if (o.end > o.start) window.intersects(o.start, o.end) else o.start >= window.start && o.start < window.end }

    override fun formatTime(time: LocalTime): String = time.toString().take(5)

    override suspend fun rememberSleepCategory(memberId: String, sleepCategoryId: String?) {
        rememberedSleep += sleepCategoryId
        viewer = viewer?.copy(sleepCategoryId = sleepCategoryId)
    }
}

class InMemoryReminderStore(lead: ReminderLead = ReminderLead.Off) : ReminderStore {
    val leadValue = MutableStateFlow(lead)
    private var scheduled = emptyList<ReminderAlarm>()
    private var snoozed = emptyList<ReminderAlarm>()

    override val lead: Flow<ReminderLead> = leadValue

    override suspend fun setLead(lead: ReminderLead) {
        leadValue.value = lead
    }

    override suspend fun scheduled() = scheduled

    override suspend fun setScheduled(alarms: List<ReminderAlarm>) {
        scheduled = alarms
    }

    override suspend fun snoozed() = snoozed

    override suspend fun setSnoozed(alarms: List<ReminderAlarm>) {
        snoozed = alarms
    }

    override suspend fun clearMember() {
        scheduled = emptyList()
        snoozed = emptyList()
    }
}
