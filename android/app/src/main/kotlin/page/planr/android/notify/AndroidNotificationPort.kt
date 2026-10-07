package page.planr.android.notify

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import page.planr.android.MainActivity
import page.planr.android.R
import page.planr.android.core.data.notify.NotificationPort
import page.planr.android.core.data.notify.NotifyChannel
import page.planr.android.core.data.notify.NotifyContent
import page.planr.android.core.data.notify.NotifyTarget
import page.planr.android.navigation.PlanrRoutes
import page.planr.android.widgets.WidgetLaunch

/**
 * The opt-in notifications on their own channels: "Time requests" (default
 * importance, the system's sound) and "Partner's changes" (low importance:
 * no sound, no peeking). Tapping one opens the app on its target the way a
 * widget row does (MainActivity validates the route): the Inbox, or the
 * agenda's day.
 */
class AndroidNotificationPort @Inject constructor(
    @ApplicationContext private val context: Context,
) : NotificationPort {
    private val manager get() = NotificationManagerCompat.from(context)

    override fun canPost(channel: NotifyChannel): Boolean =
        manager.areNotificationsEnabled() &&
            manager.getNotificationChannelCompat(channel.id)?.importance != NotificationManagerCompat.IMPORTANCE_NONE

    override fun ensureChannel(channel: NotifyChannel) {
        val (importance, name, description) = when (channel) {
            NotifyChannel.TimeRequests -> Triple(
                NotificationManagerCompat.IMPORTANCE_DEFAULT,
                R.string.notify_requests_channel_name,
                R.string.notify_requests_channel_description,
            )
            NotifyChannel.PartnerChanges -> Triple(
                NotificationManagerCompat.IMPORTANCE_LOW,
                R.string.notify_partner_channel_name,
                R.string.notify_partner_channel_description,
            )
        }
        manager.createNotificationChannel(
            NotificationChannelCompat.Builder(channel.id, importance)
                .setName(context.getString(name))
                .setDescription(context.getString(description))
                .build(),
        )
    }

    @Suppress("MissingPermission") // canPost() checks it: areNotificationsEnabled covers POST_NOTIFICATIONS.
    override fun post(content: NotifyContent) {
        if (!canPost(content.channel)) return
        ensureChannel(content.channel)
        val builder = NotificationCompat.Builder(context, content.channel.id)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(content.title)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(
                if (content.channel == NotifyChannel.PartnerChanges) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_DEFAULT,
            )
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(open(content))
        if (content.lines.size > 1) {
            val style = NotificationCompat.InboxStyle().setBigContentTitle(content.title)
            content.lines.forEach(style::addLine)
            if (content.more > 0) style.setSummaryText(context.getString(R.string.notify_more, content.more))
            builder.setContentText(content.text).setStyle(style)
        } else if (content.text.isNotEmpty()) {
            builder.setContentText(content.text).setStyle(NotificationCompat.BigTextStyle().bigText(content.text))
        }
        // Else a one-sentence notification (one partner change): the title says it all.
        manager.notify(content.id, builder.build())
    }

    override fun cancelAll(channel: NotifyChannel) {
        val notifications = context.getSystemService(NotificationManager::class.java) ?: return
        notifications.activeNotifications
            .filter { it.notification.channelId == channel.id }
            .forEach { notifications.cancel(it.tag, it.id) }
    }

    private fun open(content: NotifyContent): PendingIntent = PendingIntent.getActivity(
        context,
        content.id,
        Intent(context, MainActivity::class.java)
            .setAction(WidgetLaunch.ACTION_OPEN)
            .putExtra(WidgetLaunch.EXTRA_ROUTE, routeOf(content.target))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private val NotifyChannel.id: String
        get() = when (this) {
            NotifyChannel.TimeRequests -> TIME_REQUESTS_CHANNEL
            NotifyChannel.PartnerChanges -> PARTNER_CHANGES_CHANNEL
        }

    companion object {
        const val TIME_REQUESTS_CHANNEL = "time_requests"
        const val PARTNER_CHANGES_CHANNEL = "partner_changes"

        /** The launch route ([page.planr.android.navigation.LaunchRoute.parse]) for [target]. */
        internal fun routeOf(target: NotifyTarget): String = when (target) {
            NotifyTarget.Inbox -> PlanrRoutes.INBOX
            is NotifyTarget.Day -> "day/${target.date}"
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class NotifyPlatformModule {
    @Binds
    abstract fun bindNotificationPort(impl: AndroidNotificationPort): NotificationPort
}
