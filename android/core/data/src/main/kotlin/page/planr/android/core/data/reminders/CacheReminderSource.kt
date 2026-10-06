package page.planr.android.core.data.reminders

import android.content.Context
import android.text.format.DateFormat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaLocalTime
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.repository.OccurrenceRepository
import page.planr.android.core.data.repository.SleepPrefsRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.TimeWindow
import page.planr.android.core.model.viewerTimeZone

/**
 * Reads what a reminder plan needs from the Room cache, as the widgets do:
 * the signed-in member, their zone (`members.timezone`, else the device's)
 * and the occurrences. Their sleep category isn't cached in Room, so it is
 * kept here: from Settings when it loads or saves it, otherwise fetched at
 * most every [SLEEP_TTL] (a plan never waits on the network for long, and
 * falls back to the last known value offline, trying again after [RETRY]).
 */
@Singleton
class CacheReminderSource @Inject constructor(
    @ApplicationContext private val context: Context,
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val occurrenceRepository: OccurrenceRepository,
    private val sleepPrefs: SleepPrefsRepository,
    @ReminderDataStore private val dataStore: DataStore<Preferences>,
    private val clock: Clock,
) : ReminderSource {

    /** When fetching the sleep category last failed (epoch ms); plans in between don't retry. */
    @Volatile
    private var sleepFetchFailedAt = Long.MIN_VALUE / 2

    override suspend fun viewer(): ReminderViewer? {
        // A receiver may start the process: wait for the stored session to load.
        session.authState.first { it != AuthState.Loading }
        val me = session.currentSession ?: return null
        val members = workspace.observeMembers().first()
        return ReminderViewer(
            memberId = me.memberId,
            zone = viewerTimeZone(members.firstOrNull { it.id == me.memberId }),
            sleepCategoryId = sleepCategory(me.memberId),
        )
    }

    override suspend fun occurrences(window: TimeWindow, zone: TimeZone): List<Occurrence> =
        occurrenceRepository.snapshot(window, zone)

    override fun formatTime(time: LocalTime): String {
        val locale = context.resources.configuration.locales[0] ?: Locale.getDefault()
        val skeleton = if (DateFormat.is24HourFormat(context)) "Hm" else "hm"
        return DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)
            .format(time.toJavaLocalTime())
    }

    override suspend fun rememberSleepCategory(memberId: String, sleepCategoryId: String?) {
        dataStore.edit {
            it[ReminderKeys.sleepCategory(memberId)] = sleepCategoryId.orEmpty()
            it[ReminderKeys.sleepCategoryAt(memberId)] = clock.now().toEpochMilliseconds()
        }
    }

    private suspend fun sleepCategory(memberId: String): String? {
        val prefs = dataStore.data.first()
        val cached = prefs[ReminderKeys.sleepCategory(memberId)]
        val at = prefs[ReminderKeys.sleepCategoryAt(memberId)] ?: 0L
        val now = clock.now().toEpochMilliseconds()
        val fresh = cached != null && now - at < SLEEP_TTL.inWholeMilliseconds
        if (fresh || now - sleepFetchFailedAt < RETRY.inWholeMilliseconds) return cached?.ifEmpty { null }
        val fetched = try {
            withTimeoutOrNull(SLEEP_FETCH_BUDGET) { sleepPrefs.fetch() }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        if (fetched == null) {
            sleepFetchFailedAt = now
            return cached?.ifEmpty { null }
        }
        rememberSleepCategory(memberId, fetched.sleepCategoryId)
        return fetched.sleepCategoryId
    }

    private companion object {
        val SLEEP_TTL = 12.hours
        val SLEEP_FETCH_BUDGET = 5.seconds
        val RETRY = 15.minutes
    }
}
