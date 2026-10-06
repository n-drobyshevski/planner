package page.planr.android.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.reminders.ReminderScheduler

/** The reminder pieces, for receivers the framework instantiates. */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface ReminderEntryPoint {
    fun reminderScheduler(): ReminderScheduler

    fun reminderNotifier(): ReminderNotifier

    fun clock(): Clock

    @ApplicationScope
    fun applicationScope(): CoroutineScope

    companion object {
        fun from(context: Context): ReminderEntryPoint =
            EntryPointAccessors.fromApplication(context.applicationContext, ReminderEntryPoint::class.java)
    }
}

/**
 * A reminder alarm went off, or its Snooze button was tapped. Before
 * showing anything it asks the scheduler whether the event is still there
 * and still the member's to be reminded of (signed out, deleted, cancelled
 * or moved since: nothing shows), and shows it as it is now. The
 * scheduler's own re-plan alarm lands here too, and just re-plans.
 */
class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action !in HANDLED) return
        val alarm = if (action == ReminderIntents.ACTION_REPLAN) null else ReminderIntents.alarmOf(intent) ?: return
        val entry = ReminderEntryPoint.from(context)
        val pending = goAsync()
        entry.applicationScope().launch {
            try {
                withTimeoutOrNull(RECEIVER_BUDGET) {
                    val scheduler = entry.reminderScheduler()
                    val notifier = entry.reminderNotifier()
                    if (alarm == null) {
                        scheduler.replan()
                    } else if (action == ReminderIntents.ACTION_SNOOZE) {
                        notifier.dismiss(alarm.id)
                        scheduler.snooze(alarm)
                    } else {
                        val due = scheduler.due(alarm, snoozed = action == ReminderIntents.ACTION_SNOOZED)
                        if (due != null) notifier.show(due, entry.clock().now())
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Couldn't handle a reminder", e)
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        val HANDLED = setOf(
            ReminderIntents.ACTION_REMIND,
            ReminderIntents.ACTION_SNOOZED,
            ReminderIntents.ACTION_SNOOZE,
            ReminderIntents.ACTION_REPLAN,
        )

        /** goAsync() allows ~10 s before the broadcast is considered stuck. */
        val RECEIVER_BUDGET = 8.seconds

        const val TAG = "Planr"
    }
}

/**
 * Re-arms reminders when the system may have dropped or skewed them: a
 * reboot or app update clears alarms, a clock or zone change moves "now"
 * and the times shown, and exact-alarm access may have changed. Every
 * alarm is set again, not just the changed ones: alarms armed inexact
 * while exact access was missing only become exact when re-set. Exported
 * only so the system can deliver these broadcasts.
 */
class ReminderRescheduleReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in HANDLED) return
        val entry = ReminderEntryPoint.from(context)
        val pending = goAsync()
        entry.applicationScope().launch {
            try {
                withTimeoutOrNull(RECEIVER_BUDGET) { entry.reminderScheduler().replan(rearmAll = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Couldn't re-arm reminders", e)
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        val HANDLED = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
        )

        val RECEIVER_BUDGET = 8.seconds

        const val TAG = "Planr"
    }
}
