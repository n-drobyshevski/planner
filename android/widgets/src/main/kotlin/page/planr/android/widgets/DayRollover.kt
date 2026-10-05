package page.planr.android.widgets

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime

/**
 * Keeps the dated widgets (Today, Tasks' due labels) on the right day.
 *
 * Since Android 8 a manifest receiver no longer gets `DATE_CHANGED` or
 * `USER_PRESENT`, so midnight is an alarm instead: a non-wakeup, allow-while-
 * idle alarm at the next local midnight, delivered to [WidgetTimeReceiver]
 * (when the device sleeps through it, it fires on the next wake — exactly
 * when someone could look). The manifest receiver still covers time and zone
 * changes, which remain exempt. While the process lives, `DATE_CHANGED` and
 * an unlock (`USER_PRESENT`) also reach it, through a runtime receiver; an
 * unlock re-renders only if the day has turned since the last render.
 *
 * "Midnight" is the viewer's: the member's own zone when set (as in the app),
 * remembered from the last render; the device zone until one has happened.
 */
internal object DayRollover {
    const val ACTION_ROLLOVER = "page.planr.android.widgets.action.DAY_ROLLOVER"

    /** Fire just after midnight, so "today" has already turned. */
    private val SLACK = 2.seconds

    @Volatile
    private var renderedDay: LocalDate? = null

    @Volatile
    private var viewerZone: TimeZone? = null
    private val listening = AtomicBoolean(false)

    /** The first instant of the next local day in [zone], plus a little slack. */
    fun nextRollover(now: Instant, zone: TimeZone): Instant =
        now.toLocalDateTime(zone).date.plus(1, DateTimeUnit.DAY).atStartOfDayIn(zone) + SLACK

    /** Records the day (in the viewer's [zone]) a dated widget was just rendered for. */
    fun markRendered(day: LocalDate, zone: TimeZone) {
        renderedDay = day
        viewerZone = zone
    }

    /** The zone the widgets' "today" is judged in. */
    fun zone(): TimeZone = viewerZone ?: TimeZone.currentSystemDefault()

    /** True when a dated widget shows a day other than [today]. */
    fun isStale(today: LocalDate): Boolean = renderedDay.let { it != null && it != today }

    /** Schedules (or, with no dated widget left, cancels) the midnight alarm. */
    fun sync(context: Context) {
        val app = context.applicationContext
        val alarms = app.getSystemService(AlarmManager::class.java) ?: return
        val rollover = rolloverIntent(app)
        if (hasDatedWidgets(app)) {
            val at = nextRollover(Clock.System.now(), zone())
            alarms.setAndAllowWhileIdle(AlarmManager.RTC, at.toEpochMilliseconds(), rollover)
            listenWhileRunning(app)
        } else {
            alarms.cancel(rollover)
        }
    }

    private fun hasDatedWidgets(context: Context): Boolean {
        val manager = AppWidgetManager.getInstance(context) ?: return false
        return listOf(TodayAgendaWidgetReceiver::class.java, TasksWidgetReceiver::class.java).any { receiver ->
            manager.getAppWidgetIds(ComponentName(context, receiver)).isNotEmpty()
        }
    }

    private fun rolloverIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, WidgetTimeReceiver::class.java).setAction(ACTION_ROLLOVER),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    /** These only reach runtime receivers since Android 8; this one lives as long as the process. */
    private fun listenWhileRunning(app: Context) {
        if (!listening.compareAndSet(false, true)) return
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_DATE_CHANGED)
        }
        val receiver = WidgetTimeReceiver()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // A protected system broadcast still reaches a not-exported receiver.
            app.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            app.registerReceiver(receiver, filter)
        }
    }
}
