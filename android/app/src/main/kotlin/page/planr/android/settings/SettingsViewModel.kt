package page.planr.android.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
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

/** The Notifications section's opt-in notifications: this device's switches, and whether notifications are blocked. */
data class NotifySettings(
    /** "New time requests". */
    val newRequests: Boolean = false,
    /** "Partner's changes". */
    val partnerChanges: Boolean = false,
    /** One is on (or was just refused) but can't show: the calm line, as for reminders. */
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
    val notify: NotifySettings = NotifySettings(),
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
 * Reminders, new time requests and the partner's changes are this device's
 * own (no account write), and share one way on ([OptIn]): turning one on
 * where notifications aren't allowed first asks for the permission
 * (Android 13+); denied, or blocked with no way to ask, it goes back to
 * off and a calm line points to the system's notification settings.
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

    /** Which settings' notifications can show (the app's allowed and that channel on), as last read. */
    private val canShow = MutableStateFlow(readCanShow())
    private val askPermission = MutableStateFlow(false)

    /** The setting the permission request is for, until it is answered. */
    private var awaiting: OptIn<*>? = null
    private val reminders = OptIn(NotifyKind.Reminders, ReminderLead.Off, data::setReminderLead)
    private val newRequests = OptIn(NotifyKind.NewRequests, false, data::setNewRequestsNotify)
    private val partnerChanges = OptIn(NotifyKind.PartnerChanges, false, data::setPartnerChangesNotify)
    private val deviceZone = data.deviceZone()

    private val sleepState = combine(sleepStored, sleepPending) { stored, pending ->
        if (stored is SleepSettings.Ready) SleepSettings.Ready(pending.applyTo(stored.prefs)) else stored
    }

    private val reminderState = reminders.shown(data.reminderLead).map { (lead, blocked) -> ReminderSettings(lead, blocked) }

    private val notifyState = combine(
        newRequests.shown(data.newRequestsNotify),
        partnerChanges.shown(data.partnerChangesNotify),
    ) { (requests, requestsBlocked), (partner, partnerBlocked) ->
        NotifySettings(requests, partner, blocked = requestsBlocked || partnerBlocked)
    }

    val state: StateFlow<SettingsUiState> = combine(
        data.currentMemberId,
        data.observeMembers(),
        data.observeCategories(),
        combine(memberPending, sleepState, error, ::Triple),
        combine(reminderState, notifyState, askPermission, ::Triple),
    ) { viewerId, members, categories, (pending, sleep, error), (reminders, notify, ask) ->
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
            notify = notify,
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

    fun setReminderLead(lead: ReminderLead) = reminders.choose(lead)

    fun setNewRequestsNotify(on: Boolean) = newRequests.choose(on)

    fun setPartnerChangesNotify(on: Boolean) = partnerChanges.choose(on)

    /** The screen has launched the permission request. */
    fun onNotificationPermissionAsked() {
        askPermission.value = false
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        askPermission.value = false
        val optIn = awaiting ?: return
        awaiting = null
        canShow.value = readCanShow()
        optIn.answered(granted)
    }

    /** Back on the screen (e.g. from the system's settings): notifications may have been allowed or blocked meanwhile. */
    fun refreshNotificationAccess() {
        val shows = readCanShow()
        canShow.value = shows
        listOf(reminders, newRequests, partnerChanges).forEach { if (shows.getValue(it.kind)) it.denied.value = false }
    }

    private fun readCanShow(): Map<NotifyKind, Boolean> = NotifyKind.entries.associateWith(data::canShow)

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

    /**
     * One setting that shows notifications, [off] or on. A choice shows at
     * once and is saved with [save], one at a time and in order. Turning it
     * on where notifications aren't allowed asks for the permission first
     * (the choice shows meanwhile); refused, or blocked with no way to ask,
     * it goes back to [off] with the blocked line. Allowed, but with [kind]'s
     * channel turned off in the system's settings, it stays on with the line.
     */
    private inner class OptIn<T : Any>(val kind: NotifyKind, private val off: T, private val save: suspend (T) -> Unit) {
        /** The choice shown while the permission is asked for or the write is in flight. */
        private val pending = MutableStateFlow<T?>(null)

        /** Refused: the blocked line shows even though the setting is back to [off]. */
        val denied = MutableStateFlow(false)
        private val writes = Mutex()

        /** What the screen shows, from [stored], and whether its blocked line shows. */
        fun shown(stored: Flow<T>): Flow<Pair<T, Boolean>> =
            combine(stored, pending, canShow, denied) { saved, choice, shows, refused ->
                val value = choice ?: saved
                // Not while the permission is being asked for: the answer decides.
                value to (shows[kind] != true && (refused || (choice == null && value != off)))
            }

        fun choose(value: T) {
            val allowed = data.notificationsAllowed()
            canShow.value = readCanShow()
            when {
                value == off || allowed -> {
                    denied.value = false
                    write(value)
                }
                data.canRequestNotifications -> {
                    // Another setting still waiting for an answer shows its stored value again.
                    awaiting?.takeIf { it !== this }?.forget()
                    pending.value = value
                    awaiting = this
                    askPermission.value = true
                }
                else -> deny()
            }
        }

        fun answered(granted: Boolean) {
            val value = pending.value ?: return
            if (granted) {
                denied.value = false
                write(value)
            } else {
                pending.value = null
                deny()
            }
        }

        fun forget() {
            pending.value = null
        }

        /** Notifications can't show: back to [off], with the blocked line. */
        private fun deny() {
            denied.value = true
            write(off)
        }

        private fun write(value: T) {
            pending.value = value
            error.value = null
            writeScope.launch(start = CoroutineStart.UNDISPATCHED) {
                try {
                    writes.withLock { save(value) }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    error.value = SettingsError.SaveFailed
                } finally {
                    // A later choice may already be showing: only drop this one.
                    pending.update { if (it == value) null else it }
                }
            }
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
