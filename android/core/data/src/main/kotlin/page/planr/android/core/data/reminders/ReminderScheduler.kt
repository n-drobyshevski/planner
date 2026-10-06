package page.planr.android.core.data.reminders

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow

/**
 * The platform's alarms, as the scheduler sees them. The app implements it
 * with AlarmManager; tests with a fake. [snoozed] alarms are a separate
 * kind under the same id, so a re-plan never cancels a snooze.
 */
interface AlarmPort {
    /** Arms (or re-arms, replacing) [alarm] at its [ReminderAlarm.triggerAt]. */
    fun set(alarm: ReminderAlarm, snoozed: Boolean = false)

    fun cancel(id: Int, snoozed: Boolean = false)

    /** Takes down reminders already showing (sign-out). */
    fun dismissShown()
}

/** The signed-in member a plan is for. */
data class ReminderViewer(val memberId: String, val zone: TimeZone, val sleepCategoryId: String?)

/** What the scheduler reads: who is signed in, and the cached occurrences. */
interface ReminderSource {
    /** The signed-in member, or null when signed out. Waits for a stored session to load. */
    suspend fun viewer(): ReminderViewer?

    /** Cached occurrences overlapping [window], from Room only. */
    suspend fun occurrences(window: TimeWindow, zone: TimeZone): List<Occurrence>

    /** One time of day, as the device shows times (12/24-hour). */
    fun formatTime(time: LocalTime): String

    /** The member's sleep category as just loaded or saved, so the next plan uses it. */
    suspend fun rememberSleepCategory(memberId: String, sleepCategoryId: String?)
}

/** This device's reminder state; never synced to the account. */
interface ReminderStore {
    val lead: Flow<ReminderLead>

    suspend fun setLead(lead: ReminderLead)

    /** What the last plan armed. */
    suspend fun scheduled(): List<ReminderAlarm>

    suspend fun setScheduled(alarms: List<ReminderAlarm>)

    /** Snoozed reminders, each with its new [ReminderAlarm.triggerAt]. */
    suspend fun snoozed(): List<ReminderAlarm>

    suspend fun setSnoozed(alarms: List<ReminderAlarm>)

    /** Sign-out: forget what was armed and the member's cached details (the lead stays: it is the device's). */
    suspend fun clearMember()
}

/** What to change to get from the armed alarms to a new plan. */
data class ReminderDiff(val set: List<ReminderAlarm>, val cancel: List<Int>) {
    companion object {
        /**
         * New and changed alarms are set (all of them when [rearmAll]: the
         * system may have dropped them). Alarms no longer planned are
         * cancelled, except those already due: their delivery may lag
         * (inexact alarms, Doze), and the receiver checks them again anyway.
         */
        fun between(armed: List<ReminderAlarm>, planned: List<ReminderAlarm>, now: Instant, rearmAll: Boolean): ReminderDiff {
            val armedById = armed.associateBy { it.id }
            val plannedIds = planned.mapTo(HashSet()) { it.id }
            return ReminderDiff(
                set = planned.filter { rearmAll || armedById[it.id] != it },
                cancel = armed.filter { it.id !in plannedIds && it.triggerAt > now }.map { it.id },
            )
        }
    }
}

/**
 * Keeps one alarm per upcoming reminder armed. [replan] reads the cache,
 * plans with [ReminderPlanner] and applies only the difference to what it
 * armed last (persisted, so it survives the process). It runs after every
 * sync, write and Realtime change (through [ReminderRefresher]), on a
 * setting change, and from the app's receivers after a reboot or a clock
 * or zone change. The first plan in a process re-arms everything, since a
 * reboot or force-stop clears alarms without telling anyone.
 */
@Singleton
class ReminderScheduler @Inject constructor(
    private val source: ReminderSource,
    private val store: ReminderStore,
    private val alarms: AlarmPort,
    private val clock: Clock,
) {
    private val mutex = Mutex()
    private var armedThisProcess = false

    val lead: Flow<ReminderLead> = store.lead

    /** Saves [lead] and re-plans with it. */
    suspend fun setLead(lead: ReminderLead) {
        store.setLead(lead)
        replan()
    }

    /** Settings just loaded or saved the member's sleep category: plan with it. */
    suspend fun sleepCategoryChanged(memberId: String, sleepCategoryId: String?) {
        source.rememberSleepCategory(memberId, sleepCategoryId)
        replan()
    }

    suspend fun replan() = mutex.withLock {
        val now = clock.now()
        val lead = store.lead.first()
        val viewer = if (lead == ReminderLead.Off) null else source.viewer()
        val planned = if (viewer == null) {
            emptyList()
        } else {
            ReminderPlanner.plan(
                occurrences = source.occurrences(ReminderPlanner.window(now), viewer.zone),
                now = now,
                lead = lead.duration,
                zone = viewer.zone,
                viewerId = viewer.memberId,
                sleepCategoryId = viewer.sleepCategoryId,
                formatTime = source::formatTime,
            )
        }
        val rearmAll = !armedThisProcess
        val diff = ReminderDiff.between(store.scheduled(), planned, now, rearmAll)
        diff.cancel.forEach { alarms.cancel(it) }
        diff.set.forEach { alarms.set(it) }
        store.setScheduled(planned)

        val snoozed = store.snoozed()
        if (viewer == null) {
            snoozed.forEach { alarms.cancel(it.id, snoozed = true) }
            if (snoozed.isNotEmpty()) store.setSnoozed(emptyList())
        } else {
            // A snooze past its delivery slack is spent; a pending one is re-armed after a reboot.
            val pending = snoozed.filter { it.triggerAt > now - DELIVERY_SLACK }
            if (rearmAll) pending.filter { it.triggerAt > now }.forEach { alarms.set(it, snoozed = true) }
            if (pending.size != snoozed.size) store.setSnoozed(pending)
        }
        armedThisProcess = true
    }

    /**
     * An alarm went off: the reminder to show for it, with the event's
     * current title and times, or null when there is nothing to show any
     * more (signed out, reminders off, the event deleted, cancelled, moved
     * or no longer the viewer's, already over, or — for a planned alarm —
     * started more than [DELIVERY_SLACK] ago).
     */
    suspend fun due(alarm: ReminderAlarm, snoozed: Boolean): ReminderAlarm? {
        if (snoozed) forgetSnooze(alarm.id)
        val lead = store.lead.first()
        if (lead == ReminderLead.Off) return null
        val viewer = source.viewer() ?: return null
        val now = clock.now()
        // Around the start the alarm was planned for: a moved event has its own, newer alarm.
        val around = TimeWindow(alarm.occurrenceStart - 1.milliseconds, alarm.occurrenceStart + 1.milliseconds)
        val occurrence = source.occurrences(around, viewer.zone).firstOrNull {
            it.key == alarm.key && it.start == alarm.occurrenceStart
        } ?: return null
        if (!ReminderPlanner.isRemindable(occurrence, viewer.memberId, viewer.sleepCategoryId)) return null
        // A planned reminder held back past its slack (or fired all at once by the clock
        // jumping ahead) is stale; a snooze the member asked for shows while the event runs.
        val showUntil = if (snoozed) maxOf(occurrence.end, occurrence.start + DELIVERY_SLACK) else occurrence.start + DELIVERY_SLACK
        if (now >= showUntil) return null
        return ReminderPlanner.alarmFor(occurrence, lead.duration, viewer.zone, source::formatTime)
            .copy(triggerAt = alarm.triggerAt)
    }

    /** "Snooze": shows [alarm] again [SNOOZE] from now. */
    suspend fun snooze(alarm: ReminderAlarm) = mutex.withLock {
        val again = alarm.copy(triggerAt = clock.now() + SNOOZE)
        alarms.set(again, snoozed = true)
        store.setSnoozed(store.snoozed().filter { it.id != alarm.id } + again)
    }

    /** Sign-out: cancels every alarm and takes down shown reminders. */
    suspend fun clearLocal() = mutex.withLock {
        store.scheduled().forEach { alarms.cancel(it.id) }
        store.snoozed().forEach { alarms.cancel(it.id, snoozed = true) }
        store.clearMember()
        alarms.dismissShown()
    }

    private suspend fun forgetSnooze(id: Int) = mutex.withLock {
        val snoozed = store.snoozed()
        if (snoozed.any { it.id == id }) store.setSnoozed(snoozed.filter { it.id != id })
    }

    companion object {
        val SNOOZE = 10.minutes

        /** How late an alarm may still be shown (Doze can hold inexact alarms back). */
        val DELIVERY_SLACK = 15.minutes
    }
}

/**
 * Re-plans reminders wherever the widgets re-render: after the periodic
 * sync, in-app writes and Realtime changes, and the sign-out wipe — the
 * same moments the cache they read from changes. It [followsClock]: the plan
 * covers the next [ReminderPlanner.HORIZON] only, so a sync that changed
 * nothing still moves it forward.
 */
class ReminderRefresher @Inject constructor(private val scheduler: ReminderScheduler) : WidgetRefresher {
    override suspend fun refreshWidgets() = scheduler.replan()

    override val followsClock: Boolean get() = true
}
