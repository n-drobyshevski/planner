package page.planr.android.reminders

import android.content.Context
import android.content.Intent
import kotlin.time.Instant
import page.planr.android.core.data.reminders.ReminderAlarm

/**
 * The broadcasts behind a reminder, all explicit to [ReminderReceiver]. The
 * three actions keep three separate PendingIntents per reminder id (the
 * planned alarm, its snooze and the Snooze button), so cancelling one never
 * cancels another. The alarm travels in extras. [ACTION_REPLAN] carries none:
 * it is the scheduler's own re-plan alarm, one per app.
 */
internal object ReminderIntents {
    const val ACTION_REMIND = "page.planr.android.reminders.action.REMIND"
    const val ACTION_SNOOZED = "page.planr.android.reminders.action.SNOOZED"
    const val ACTION_SNOOZE = "page.planr.android.reminders.action.SNOOZE"
    const val ACTION_REPLAN = "page.planr.android.reminders.action.REPLAN"

    private const val EXTRA_ID = "id"
    private const val EXTRA_KEY = "key"
    private const val EXTRA_EVENT_ID = "event_id"
    private const val EXTRA_START = "start"
    private const val EXTRA_TRIGGER = "trigger"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TIME = "time"

    fun broadcast(context: Context, action: String, alarm: ReminderAlarm? = null): Intent =
        Intent(context, ReminderReceiver::class.java).setAction(action).apply {
            if (alarm == null) return@apply
            putExtra(EXTRA_ID, alarm.id)
            putExtra(EXTRA_KEY, alarm.key)
            putExtra(EXTRA_EVENT_ID, alarm.eventId)
            putExtra(EXTRA_START, alarm.occurrenceStart.toEpochMilliseconds())
            putExtra(EXTRA_TRIGGER, alarm.triggerAt.toEpochMilliseconds())
            putExtra(EXTRA_TITLE, alarm.title)
            putExtra(EXTRA_TIME, alarm.timeText)
        }

    /** The alarm in [intent]'s extras; null when any part is missing. */
    fun alarmOf(intent: Intent): ReminderAlarm? {
        if (!intent.hasExtra(EXTRA_ID) || !intent.hasExtra(EXTRA_START) || !intent.hasExtra(EXTRA_TRIGGER)) return null
        return ReminderAlarm(
            id = intent.getIntExtra(EXTRA_ID, 0),
            key = intent.getStringExtra(EXTRA_KEY) ?: return null,
            eventId = intent.getStringExtra(EXTRA_EVENT_ID) ?: return null,
            occurrenceStart = Instant.fromEpochMilliseconds(intent.getLongExtra(EXTRA_START, 0L)),
            triggerAt = Instant.fromEpochMilliseconds(intent.getLongExtra(EXTRA_TRIGGER, 0L)),
            title = intent.getStringExtra(EXTRA_TITLE).orEmpty(),
            timeText = intent.getStringExtra(EXTRA_TIME).orEmpty(),
        )
    }
}
