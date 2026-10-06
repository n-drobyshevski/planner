package page.planr.android.settings

import android.os.Build
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.ZoneId
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.model.MemberPreferencesPatch
import page.planr.android.core.data.model.SleepPrefsPatch
import page.planr.android.core.data.reminders.ReminderLead
import page.planr.android.core.data.reminders.ReminderScheduler
import page.planr.android.core.data.repository.SleepPrefsRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.reminders.ReminderNotifier

/** What the Settings screen reads and writes; the repositories behind it keep Room and the widgets in step. */
interface SettingsDataSource {
    val currentMemberId: Flow<String?>

    fun observeMembers(): Flow<List<Member>>

    fun observeCategories(): Flow<List<Category>>

    /** The phone's own zone (what a null primary zone follows). */
    fun deviceZone(): String

    suspend fun updateMemberPreferences(patch: MemberPreferencesPatch)

    suspend fun fetchSleepPrefs(): SleepBlockPrefs

    /** Returns the settings as stored. */
    suspend fun saveSleepPrefs(patch: SleepPrefsPatch): SleepBlockPrefs

    /** How long before an event its reminder shows: this device's own setting, never synced. */
    val reminderLead: Flow<ReminderLead>

    /** Saves [lead] and re-arms reminders with it. */
    suspend fun setReminderLead(lead: ReminderLead)

    /** Whether the app may post notifications right now. */
    fun notificationsAllowed(): Boolean

    /** Whether the app can ask for notifications (Android 13+); before that only system settings turn them on. */
    val canRequestNotifications: Boolean
}

class RepositorySettingsDataSource @Inject constructor(
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val sleep: SleepPrefsRepository,
    private val reminders: ReminderScheduler,
    private val notifier: ReminderNotifier,
    @ApplicationScope private val appScope: CoroutineScope,
) : SettingsDataSource {
    override val currentMemberId: Flow<String?> =
        session.authState.map { (it as? AuthState.SignedIn)?.session?.memberId }.distinctUntilChanged()

    override fun observeMembers(): Flow<List<Member>> = workspace.observeMembers()

    override fun observeCategories(): Flow<List<Category>> = workspace.observeCategories()

    override fun deviceZone(): String = ZoneId.systemDefault().id

    override suspend fun updateMemberPreferences(patch: MemberPreferencesPatch) = workspace.updateMemberPreferences(patch)

    // Reminders leave out the member's sleep, so they follow its category as soon as it is known.
    override suspend fun fetchSleepPrefs(): SleepBlockPrefs = sleep.fetch().also { sleepCategoryKnown(it) }

    override suspend fun saveSleepPrefs(patch: SleepPrefsPatch): SleepBlockPrefs = sleep.save(patch).also { sleepCategoryKnown(it) }

    override val reminderLead: Flow<ReminderLead> = reminders.lead

    override suspend fun setReminderLead(lead: ReminderLead) {
        // The channel exists from the moment reminders are on, so its settings are reachable.
        if (lead != ReminderLead.Off) notifier.ensureChannel()
        reminders.setLead(lead)
    }

    override fun notificationsAllowed(): Boolean = notifier.canPost()

    override val canRequestNotifications: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    /**
     * Off the caller: the sleep section never waits on the re-plan (another
     * one may hold it on the network), nor cancels it by leaving the screen.
     */
    private fun sleepCategoryKnown(prefs: SleepBlockPrefs) {
        val me = session.currentSession ?: return
        appScope.launch(start = CoroutineStart.UNDISPATCHED) {
            try {
                reminders.sleepCategoryChanged(me.memberId, prefs.sleepCategoryId)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Reminders catch up on the next re-plan; the sleep settings themselves loaded or saved.
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class SettingsDataModule {
    @Binds
    abstract fun bindSettingsDataSource(impl: RepositorySettingsDataSource): SettingsDataSource
}
