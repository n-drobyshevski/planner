package page.planr.android.reminders

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import kotlin.time.Instant
import page.planr.android.core.data.reminders.AlarmPort
import page.planr.android.core.data.reminders.ReminderAlarm

/**
 * Reminders as AlarmManager alarms: RTC_WAKEUP, exact while idle when the
 * app may (USE_EXACT_ALARM from Android 13, which a calendar qualifies for;
 * SCHEDULE_EXACT_ALARM before), otherwise allowed-while-idle and a little
 * inexact rather than not at all.
 */
class AndroidAlarmPort @Inject constructor(
    @ApplicationContext private val context: Context,
) : AlarmPort {
    private val alarms get() = context.getSystemService(AlarmManager::class.java)

    override fun set(alarm: ReminderAlarm, snoozed: Boolean) {
        val manager = alarms ?: return
        val intent = PendingIntent.getBroadcast(
            context,
            alarm.id,
            ReminderIntents.broadcast(context, action(snoozed), alarm),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val at = alarm.triggerAt.toEpochMilliseconds()
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
            } else {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
            }
        } catch (_: SecurityException) {
            // Exact access revoked between the check and the call.
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
        }
    }

    override fun cancel(id: Int, snoozed: Boolean) {
        val intent = PendingIntent.getBroadcast(
            context,
            id,
            ReminderIntents.broadcast(context, action(snoozed)),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE,
        ) ?: return
        alarms?.cancel(intent)
        intent.cancel()
    }

    override fun setReplan(at: Instant) {
        val manager = alarms ?: return
        val intent = PendingIntent.getBroadcast(
            context,
            REPLAN_REQUEST,
            ReminderIntents.broadcast(context, ReminderIntents.ACTION_REPLAN),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // Inexact is enough (it only moves the horizon on) and needs no exact-alarm access.
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toEpochMilliseconds(), intent)
    }

    override fun cancelReplan() {
        val intent = PendingIntent.getBroadcast(
            context,
            REPLAN_REQUEST,
            ReminderIntents.broadcast(context, ReminderIntents.ACTION_REPLAN),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE,
        ) ?: return
        alarms?.cancel(intent)
        intent.cancel()
    }

    override fun dismissShown() {
        val notifications = context.getSystemService(NotificationManager::class.java) ?: return
        notifications.activeNotifications
            .filter { it.notification.channelId == ReminderNotifier.CHANNEL_ID }
            .forEach { notifications.cancel(it.tag, it.id) }
    }

    private fun action(snoozed: Boolean) = if (snoozed) ReminderIntents.ACTION_SNOOZED else ReminderIntents.ACTION_REMIND

    private companion object {
        /** Its own action already keeps it apart from every reminder's PendingIntent. */
        const val REPLAN_REQUEST = 0
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ReminderPlatformModule {
    @Binds
    abstract fun bindAlarmPort(impl: AndroidAlarmPort): AlarmPort
}
