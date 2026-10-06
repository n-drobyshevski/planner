package page.planr.android.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.model.MemberPreferencesPatch
import page.planr.android.core.data.model.SleepPrefsPatch
import page.planr.android.core.data.reminders.ReminderLead
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.recurrence.PatchField.Value

/** The member's own preferences on the Settings screen ([Member]'s columns). */
data class TimeSettings(
    /** IANA zone; null = follow the device. */
    val timezone: String? = null,
    /** null = no second clock. */
    val secondaryTimezone: String? = null,
    val showSuccessToasts: Boolean = true,
)

/** The sleep section: loading, loaded, or a calm failure with a retry. */
sealed interface SleepSettings {
    data object Loading : SleepSettings

    data object Unavailable : SleepSettings

    data class Ready(val prefs: SleepBlockPrefs) : SleepSettings
}

/** The reminders section: this device's lead, and whether notifications are blocked. */
data class ReminderSettings(
    val lead: ReminderLead = ReminderLead.Off,
    /** Reminders can't show: the calm line with a way to the system's notification settings. */
    val blocked: Boolean = false,
)

/** Why the calm error line shows. */
enum class SettingsError { SaveFailed }

data class SettingsUiState(
    /** Null until the member's row is cached. */
    val time: TimeSettings? = null,
    val deviceZone: String = "UTC",
    /** The partner's explicit zone, offered first for the second clock. */
    val partnerZones: List<PartnerZone> = emptyList(),
    val sleep: SleepSettings = SleepSettings.Loading,
    /** What sleep can be filed under: shared contexts and the viewer's own. */
    val sleepCategories: List<Category> = emptyList(),
    val reminders: ReminderSettings = ReminderSettings(),
    /** Ask for the notification permission now (Android 13+); the screen reports back. */
    val askNotificationPermission: Boolean = false,
    val error: SettingsError? = null,
)

/**
 * Settings that apply at once (no Save step, as on the web's /settings).
 * Each change shows immediately; its write goes through the repositories
 * (members: Room follows the stored row; sleep: an upsert of only the edited
 * columns). A failed write rolls the control back and leaves a calm error
 * line. Writes run in the application scope, so leaving the screen right
 * after a tap doesn't cancel them, and each kind is sent one at a time, in
 * order: each write joins its queue on the caller's thread
 * ([CoroutineStart.UNDISPATCHED]) before the multi-threaded application
 * scope can reorder two quick taps.
 *
 * Reminders are this device's own (no account write). Turning them on
 * where notifications aren't allowed first asks for the permission
 * (Android 13+); denied, or blocked with no way to ask, they go back to
 * Off and a calm line points to the system's notification settings.
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val data: SettingsDataSource,
    @ApplicationScope private val writeScope: CoroutineScope,
) : ViewModel() {

    /** Member changes shown ahead of their write; dropped once it lands or fails. */
    private val memberPending = MutableStateFlow(MemberPreferencesPatch())
    private val sleepStored = MutableStateFlow<SleepSettings>(SleepSettings.Loading)
    private val sleepPending = MutableStateFlow(SleepPrefsPatch())
    private val error = MutableStateFlow<SettingsError?>(null)
    private val memberWrites = Mutex()
    private val sleepWrites = Mutex()
    private val reminderWrites = Mutex()

    /** The lead shown while the permission is asked for or the write is in flight. */
    private val reminderPending = MutableStateFlow<ReminderLead?>(null)
    private val notificationsAllowed = MutableStateFlow(data.notificationsAllowed())
    private val permissionDenied = MutableStateFlow(false)
    private val askPermission = MutableStateFlow(false)
    private val deviceZone = data.deviceZone()

    private val sleepState = combine(sleepStored, sleepPending) { stored, pending ->
        if (stored is SleepSettings.Ready) SleepSettings.Ready(pending.applyTo(stored.prefs)) else stored
    }

    private val reminderState = combine(
        data.reminderLead,
        reminderPending,
        notificationsAllowed,
        permissionDenied,
    ) { stored, pending, allowed, denied ->
        val lead = pending ?: stored
        // Not while the permission is being asked for: the answer decides.
        ReminderSettings(lead, blocked = !allowed && (denied || (pending == null && lead != ReminderLead.Off)))
    }

    val state: StateFlow<SettingsUiState> = combine(
        data.currentMemberId,
        data.observeMembers(),
        data.observeCategories(),
        combine(memberPending, sleepState, error, ::Triple),
        combine(reminderState, askPermission, ::Pair),
    ) { viewerId, members, categories, (pending, sleep, error), (reminders, ask) ->
        val me = members.firstOrNull { it.id == viewerId }
        SettingsUiState(
            time = me?.let { pending.applyTo(it) }?.let { TimeSettings(it.timezone, it.secondaryTimezone, it.showSuccessToasts) },
            deviceZone = deviceZone,
            partnerZones = members
                .filter { it.id != viewerId && it.timezone != null }
                .map { PartnerZone(it.name, it.timezone!!) }
                .distinctBy { it.zone },
            sleep = sleep,
            sleepCategories = categories.filter { it.ownerId == null || it.ownerId == viewerId }.sortedBy { it.sortOrder },
            reminders = reminders,
            askNotificationPermission = ask,
            error = error,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SettingsUiState(deviceZone = deviceZone))

    init {
        loadSleep()
    }

    /** Null follows the device. */
    fun setTimezone(zone: String?) = writeMember(MemberPreferencesPatch(timezone = Value(zone)))

    /** Null turns the second clock off. */
    fun setSecondaryTimezone(zone: String?) = writeMember(MemberPreferencesPatch(secondaryTimezone = Value(zone)))

    /** The second clock's switch: on starts from the partner's zone, else the device's (as on the web). */
    fun setSecondaryEnabled(on: Boolean) {
        val current = state.value
        setSecondaryTimezone(if (on) current.partnerZones.firstOrNull()?.zone ?: current.deviceZone else null)
    }

    fun setShowSuccessToasts(show: Boolean) = writeMember(MemberPreferencesPatch(showSuccessToasts = Value(show)))

    fun setSleepCategory(categoryId: String?) = writeSleep(SleepPrefsPatch(sleepCategoryId = Value(categoryId)))

    fun setNightStart(hour: Int) = writeSleep(SleepPrefsPatch(nightWindowStartHour = Value(hour)))

    fun setNightEnd(hour: Int) = writeSleep(SleepPrefsPatch(nightWindowEndHour = Value(hour)))

    fun setAutoAdjust(on: Boolean) = writeSleep(SleepPrefsPatch(autoAdjust = Value(on)))

    fun setReminderLead(lead: ReminderLead) {
        val allowed = data.notificationsAllowed()
        notificationsAllowed.value = allowed
        when {
            lead == ReminderLead.Off || allowed -> {
                permissionDenied.value = false
                writeReminder(lead)
            }
            data.canRequestNotifications -> {
                reminderPending.value = lead
                askPermission.value = true
            }
            else -> denyReminders()
        }
    }

    /** The screen has launched the permission request. */
    fun onNotificationPermissionAsked() {
        askPermission.value = false
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        askPermission.value = false
        val lead = reminderPending.value ?: return
        notificationsAllowed.value = data.notificationsAllowed()
        if (granted) {
            permissionDenied.value = false
            writeReminder(lead)
        } else {
            reminderPending.value = null
            denyReminders()
        }
    }

    /** Back on the screen (e.g. from the system's settings): notifications may have been allowed or blocked meanwhile. */
    fun refreshNotificationAccess() {
        val allowed = data.notificationsAllowed()
        notificationsAllowed.value = allowed
        if (allowed) permissionDenied.value = false
    }

    /** The sleep section's "Try again" after a failed load. */
    fun retrySleep() {
        if (sleepStored.value == SleepSettings.Unavailable) loadSleep()
    }

    fun dismissError() {
        error.value = null
    }

    private fun loadSleep() {
        sleepStored.value = SleepSettings.Loading
        viewModelScope.launch {
            sleepStored.value = try {
                SleepSettings.Ready(data.fetchSleepPrefs())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                SleepSettings.Unavailable
            }
        }
    }

    private fun writeMember(patch: MemberPreferencesPatch) {
        if (state.value.time == null) return
        memberPending.update { it + patch }
        error.value = null
        writeScope.launch(start = CoroutineStart.UNDISPATCHED) {
            try {
                memberWrites.withLock { data.updateMemberPreferences(patch) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                error.value = SettingsError.SaveFailed
            } finally {
                // Landed: the cached member now shows it. Failed: the cached value shows again.
                memberPending.update { it.without(patch) }
            }
        }
    }

    private fun writeSleep(patch: SleepPrefsPatch) {
        if (sleepStored.value !is SleepSettings.Ready) return
        sleepPending.update { it + patch }
        error.value = null
        writeScope.launch(start = CoroutineStart.UNDISPATCHED) {
            try {
                sleepWrites.withLock { sleepStored.value = SleepSettings.Ready(data.saveSleepPrefs(patch)) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                error.value = SettingsError.SaveFailed
            } finally {
                sleepPending.update { it.without(patch) }
            }
        }
    }

    /** Notifications can't show: back to Off, with the blocked line. */
    private fun denyReminders() {
        permissionDenied.value = true
        writeReminder(ReminderLead.Off)
    }

    private fun writeReminder(lead: ReminderLead) {
        reminderPending.value = lead
        error.value = null
        writeScope.launch(start = CoroutineStart.UNDISPATCHED) {
            try {
                reminderWrites.withLock { data.setReminderLead(lead) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                error.value = SettingsError.SaveFailed
            } finally {
                // A later choice may already be showing: only drop this one.
                reminderPending.update { if (it == lead) null else it }
            }
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
