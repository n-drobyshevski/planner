package page.planr.android.widgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.todayIn

/**
 * Re-renders the widgets when "today" may have changed: the midnight alarm
 * ([DayRollover]), a clock or zone change, a language change, and (while the
 * process lives) an unlock after the day turned. Rendering reads Room only.
 */
class WidgetTimeReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action !in HANDLED) return
        if (action == Intent.ACTION_USER_PRESENT && !dayTurned()) return

        val app = context.applicationContext
        val pending = goAsync()
        scope.launch {
            try {
                withTimeoutOrNull(RECEIVER_BUDGET) {
                    WidgetUpdates.refreshAll(app)
                }
            } finally {
                // Always re-arm: the alarm is one-shot, and a zone change moves midnight.
                DayRollover.sync(app)
                pending.finish()
            }
        }
    }

    private fun dayTurned(): Boolean = DayRollover.isStale(Clock.System.todayIn(DayRollover.zone()))

    private companion object {
        val HANDLED = setOf(
            DayRollover.ACTION_ROLLOVER,
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_LOCALE_CHANGED,
            Intent.ACTION_USER_PRESENT,
        )

        /** goAsync() allows ~10 s before the broadcast is considered stuck. */
        val RECEIVER_BUDGET = 8.seconds

        val scope = widgetScope()
    }
}
