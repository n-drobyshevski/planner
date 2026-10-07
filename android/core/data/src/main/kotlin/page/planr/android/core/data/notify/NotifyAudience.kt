package page.planr.android.core.data.notify

import android.content.Context
import android.text.format.DateFormat
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.first
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaLocalDate
import kotlinx.datetime.toJavaLocalTime
import page.planr.android.core.data.reminders.ReminderSource
import page.planr.android.core.data.repository.WorkspaceRepository

/** Who the notifications are for: the signed-in member, their zone and sleep, and their partner. */
data class NotifyViewer(
    val memberId: String,
    val zone: TimeZone,
    /** The member's sleep category; null = their inactive blocks are their sleep. */
    val sleepCategoryId: String?,
    /** The workspace's other member; null until the members are cached. */
    val partnerId: String?,
    /** The partner's display name. */
    val partnerName: String?,
)

/** Reads the [NotifyViewer] from the cache; behind an interface so the notifiers are testable. */
fun interface NotifyAudience {
    /** Null when signed out. Waits for a stored session to load. */
    suspend fun viewer(): NotifyViewer?
}

/** The reminders' viewer (member, zone, sleep category) plus the partner from the cached members. */
class CacheNotifyAudience @Inject constructor(
    private val reminders: ReminderSource,
    private val workspace: WorkspaceRepository,
) : NotifyAudience {
    override suspend fun viewer(): NotifyViewer? {
        val me = reminders.viewer() ?: return null
        val partner = workspace.observeMembers().first().firstOrNull { it.id != me.memberId }
        return NotifyViewer(me.memberId, me.zone, me.sleepCategoryId, partner?.id, partner?.name)
    }
}

/** How a notification writes a day and a time of day. */
interface WhenFormats {
    /** "Tue 7 Oct". */
    fun day(date: LocalDate): String

    /** "14:00" or "2:00 PM", as the device shows times. */
    fun time(time: LocalTime): String
}

/** In the device's locale and 12/24-hour setting, from the platform's best-pattern lookup (as the Inbox formats). */
class DeviceWhenFormats @Inject constructor(@ApplicationContext private val context: Context) : WhenFormats {
    private val locale: Locale get() = context.resources.configuration.locales[0] ?: Locale.getDefault()

    override fun day(date: LocalDate): String = formatter("EEEdMMM").format(date.toJavaLocalDate())

    override fun time(time: LocalTime): String =
        formatter(if (DateFormat.is24HourFormat(context)) "Hm" else "hm").format(time.toJavaLocalTime())

    private fun formatter(skeleton: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)
}
