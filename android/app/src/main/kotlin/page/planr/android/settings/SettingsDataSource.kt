package page.planr.android.settings

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.model.MemberPreferencesPatch
import page.planr.android.core.data.model.SleepPrefsPatch
import page.planr.android.core.data.repository.SleepPrefsRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member

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
}

class RepositorySettingsDataSource @Inject constructor(
    private val session: SessionManager,
    private val workspace: WorkspaceRepository,
    private val sleep: SleepPrefsRepository,
) : SettingsDataSource {
    override val currentMemberId: Flow<String?> =
        session.authState.map { (it as? AuthState.SignedIn)?.session?.memberId }.distinctUntilChanged()

    override fun observeMembers(): Flow<List<Member>> = workspace.observeMembers()

    override fun observeCategories(): Flow<List<Category>> = workspace.observeCategories()

    override fun deviceZone(): String = ZoneId.systemDefault().id

    override suspend fun updateMemberPreferences(patch: MemberPreferencesPatch) = workspace.updateMemberPreferences(patch)

    override suspend fun fetchSleepPrefs(): SleepBlockPrefs = sleep.fetch()

    override suspend fun saveSleepPrefs(patch: SleepPrefsPatch): SleepBlockPrefs = sleep.save(patch)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class SettingsDataModule {
    @Binds
    abstract fun bindSettingsDataSource(impl: RepositorySettingsDataSource): SettingsDataSource
}
