package page.planr.android.reminders

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlin.math.roundToLong
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant
import page.planr.android.MainActivity
import page.planr.android.R
import page.planr.android.core.data.reminders.ReminderAlarm
import page.planr.android.navigation.LaunchRoute
import page.planr.android.widgets.WidgetLaunch

/** When a reminder's event starts, relative to the moment it shows. */
internal sealed interface StartsIn {
    data class Minutes(val minutes: Long) : StartsIn

    data object Now : StartsIn

    data class StartedAgo(val minutes: Long) : StartsIn

    companion object {
        /** Rounded to the nearest minute; within half a minute either side is "now". */
        fun between(now: Instant, start: Instant): StartsIn {
            val minutes = ((start - now) / 1.minutes).roundToLong()
            return when {
                minutes > 0 -> Minutes(minutes)
                minutes == 0L -> Now
                else -> StartedAgo(-minutes)
            }
        }
    }
}

/**
 * Posts event reminders on their own channel ("Event reminders", default
 * importance, the system's own sound): the event's title, then
 * "10:30–11:15 · in 10 min". Tapping opens the event (the widgets' launch
 * route); "Snooze 10 min" brings it back ten minutes on
 * (`ReminderScheduler.SNOOZE`).
 */
class ReminderNotifier @Inject constructor(@ApplicationContext private val context: Context) {
    private val manager get() = NotificationManagerCompat.from(context)

    /**
     * False while reminders can't show: the app's notifications blocked (or
     * not yet allowed on Android 13+), or just the reminders channel turned off.
     */
    fun canPost(): Boolean =
        manager.areNotificationsEnabled() &&
            manager.getNotificationChannelCompat(CHANNEL_ID)?.importance != NotificationManagerCompat.IMPORTANCE_NONE

    /** Creates (or renames, after a language change) the channel; safe to call any time. */
    fun ensureChannel() {
        manager.createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_DEFAULT)
                .setName(context.getString(R.string.reminders_channel_name))
                .setDescription(context.getString(R.string.reminders_channel_description))
                .build(),
        )
    }

    @Suppress("MissingPermission") // canPost() checks it: areNotificationsEnabled covers POST_NOTIFICATIONS.
    fun show(alarm: ReminderAlarm, now: Instant) {
        if (!canPost()) return
        ensureChannel()
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(alarm.title)
            .setContentText(text(alarm, now))
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setWhen(alarm.occurrenceStart.toEpochMilliseconds())
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(openEvent(alarm))
            .addAction(0, context.getString(R.string.reminders_snooze), snooze(alarm))
            .build()
        manager.notify(alarm.id, notification)
    }

    fun dismiss(id: Int) = manager.cancel(id)

    private fun text(alarm: ReminderAlarm, now: Instant): String = when (val startsIn = StartsIn.between(now, alarm.occurrenceStart)) {
        is StartsIn.Minutes -> context.getString(R.string.reminders_text_in, alarm.timeText, startsIn.minutes)
        StartsIn.Now -> context.getString(R.string.reminders_text_now, alarm.timeText)
        is StartsIn.StartedAgo -> context.getString(R.string.reminders_text_started, alarm.timeText, startsIn.minutes)
    }

    /** Opens the event the way a widget row does; MainActivity validates the route. */
    private fun openEvent(alarm: ReminderAlarm): PendingIntent = PendingIntent.getActivity(
        context,
        alarm.id,
        Intent(context, MainActivity::class.java)
            .setAction(WidgetLaunch.ACTION_OPEN)
            .putExtra(WidgetLaunch.EXTRA_ROUTE, LaunchRoute.Event(Uri.encode(alarm.key)).route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun snooze(alarm: ReminderAlarm): PendingIntent = PendingIntent.getBroadcast(
        context,
        alarm.id,
        ReminderIntents.broadcast(context, ReminderIntents.ACTION_SNOOZE, alarm),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    companion object {
        const val CHANNEL_ID = "event_reminders"
    }
}
