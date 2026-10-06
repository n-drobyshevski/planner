package page.planr.android.settings

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Rule
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.model.MemberPreferencesPatch
import page.planr.android.core.data.model.SleepPrefsPatch
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.recurrence.PatchField

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val anna = Member(id = ANNA, workspaceId = WS, name = "Anna", color = "#c0492a", timezone = "Europe/Berlin")
    private val boris = Member(id = BORIS, workspaceId = WS, name = "Boris", color = "#0f766e", timezone = "Asia/Tokyo")
    private val shared = Category(id = "cat-home", workspaceId = WS, ownerId = null, name = "Home", color = "#b45309", sortOrder = 2)
    private val annaSleep = Category(id = "cat-sleep", workspaceId = WS, ownerId = ANNA, name = "Sleep", color = "#2a77b8", sortOrder = 1)
    private val borisOwn = Category(id = "cat-boris", workspaceId = WS, ownerId = BORIS, name = "Gym", color = "#2a77b8")

    private val data = FakeSettingsDataSource(members = listOf(anna, boris), categories = listOf(shared, annaSleep, borisOwn))

    private fun TestScope.subject(): SettingsViewModel {
        val vm = SettingsViewModel(data, backgroundScope)
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect {} }
        runCurrent()
        return vm
    }

    @Test
    fun `loads the member's zones, the partner's zone, sleep contexts and settings`() = runTest {
        val state = subject().state.value

        assertEquals(TimeSettings("Europe/Berlin", null, showSuccessToasts = true), state.time)
        assertEquals("Europe/London", state.deviceZone)
        assertEquals(listOf(PartnerZone("Boris", "Asia/Tokyo")), state.partnerZones)
        assertEquals(listOf(annaSleep.id, shared.id), state.sleepCategories.map { it.id }, "own and shared, in order")
        assertEquals(SleepSettings.Ready(SleepBlockPrefs()), state.sleep)
    }

    @Test
    fun `a zone change shows at once and stays once stored`() = runTest {
        val vm = subject()
        val gate = CompletableDeferred<Unit>()
        data.memberGate = gate

        vm.setTimezone(null)
        runCurrent()
        assertNull(vm.state.value.time?.timezone, "shown while the write is in flight")
        assertEquals(listOf(MemberPreferencesPatch(timezone = PatchField.Value(null))), data.memberWrites)

        gate.complete(Unit)
        runCurrent()
        assertNull(vm.state.value.time?.timezone)
        assertNull(vm.state.value.error)
    }

    @Test
    fun `a failed write puts the control back and says so, the next change clears it`() = runTest {
        val vm = subject()
        data.failMember = IllegalStateException("offline")

        vm.setShowSuccessToasts(false)
        runCurrent()

        assertEquals(true, vm.state.value.time?.showSuccessToasts)
        assertEquals(SettingsError.SaveFailed, vm.state.value.error)

        data.failMember = null
        vm.setShowSuccessToasts(false)
        assertNull(vm.state.value.error)
        runCurrent()
        assertEquals(false, vm.state.value.time?.showSuccessToasts)
    }

    @Test
    fun `the second clock starts from the partner's zone, else the device's, and turns off as null`() = runTest {
        val vm = subject()

        vm.setSecondaryEnabled(true)
        runCurrent()
        assertEquals("Asia/Tokyo", vm.state.value.time?.secondaryTimezone)

        vm.setSecondaryEnabled(false)
        runCurrent()
        assertNull(vm.state.value.time?.secondaryTimezone)

        data.members.value = listOf(data.members.value.first(), boris.copy(timezone = null))
        runCurrent()
        vm.setSecondaryEnabled(true)
        runCurrent()
        assertEquals("Europe/London", vm.state.value.time?.secondaryTimezone)
        assertEquals(
            listOf<PatchField<String?>>(PatchField.Value("Asia/Tokyo"), PatchField.Value(null), PatchField.Value("Europe/London")),
            data.memberWrites.map { it.secondaryTimezone },
        )
    }

    @Test
    fun `a sleep change sends only that column and keeps what the server stored`() = runTest {
        val vm = subject()
        val gate = CompletableDeferred<Unit>()
        data.sleepGate = gate

        vm.setAutoAdjust(false)
        runCurrent()
        assertEquals(false, (vm.state.value.sleep as SleepSettings.Ready).prefs.autoAdjust, "optimistic")

        gate.complete(Unit)
        runCurrent()
        assertEquals(listOf(SleepPrefsPatch(autoAdjust = PatchField.Value(false))), data.sleepWrites)
        assertEquals(SleepBlockPrefs(autoAdjust = false), (vm.state.value.sleep as SleepSettings.Ready).prefs)
    }

    @Test
    fun `a failed sleep save rolls back with the error line`() = runTest {
        val vm = subject()
        data.failSleep = IllegalStateException("offline")

        vm.setNightStart(22)
        vm.setSleepCategory(annaSleep.id)
        runCurrent()

        assertEquals(SleepBlockPrefs(), (vm.state.value.sleep as SleepSettings.Ready).prefs)
        assertEquals(SettingsError.SaveFailed, vm.state.value.error)
    }

    @Test
    fun `sleep settings that can't load offer a retry, and ignore changes meanwhile`() = runTest {
        data.failSleepLoad = IllegalStateException("offline")
        val vm = subject()
        assertIs<SleepSettings.Unavailable>(vm.state.value.sleep)

        vm.setAutoAdjust(false)
        runCurrent()
        assertEquals(emptyList(), data.sleepWrites)

        data.failSleepLoad = null
        vm.retrySleep()
        runCurrent()
        assertEquals(SleepSettings.Ready(SleepBlockPrefs()), vm.state.value.sleep)
    }

    private companion object {
        const val WS = "ws-1"
        const val ANNA = "member-a"
        const val BORIS = "member-b"
    }
}

private class FakeSettingsDataSource(members: List<Member>, categories: List<Category>) : SettingsDataSource {
    val members = MutableStateFlow(members)
    val categories = MutableStateFlow(categories)
    var sleep = SleepBlockPrefs()
    val memberWrites = mutableListOf<MemberPreferencesPatch>()
    val sleepWrites = mutableListOf<SleepPrefsPatch>()
    var failMember: Exception? = null
    var failSleep: Exception? = null
    var failSleepLoad: Exception? = null

    /** When set, a write waits for it (a write in flight). */
    var memberGate: CompletableDeferred<Unit>? = null
    var sleepGate: CompletableDeferred<Unit>? = null

    override val currentMemberId: Flow<String?> = MutableStateFlow(members.first().id)

    override fun observeMembers(): Flow<List<Member>> = members

    override fun observeCategories(): Flow<List<Category>> = categories

    override fun deviceZone(): String = "Europe/London"

    override suspend fun updateMemberPreferences(patch: MemberPreferencesPatch) {
        memberWrites += patch
        memberGate?.await()
        failMember?.let { throw it }
        val me = members.value.first()
        members.update { list -> listOf(patch.applyTo(me)) + list.drop(1) }
    }

    override suspend fun fetchSleepPrefs(): SleepBlockPrefs {
        failSleepLoad?.let { throw it }
        return sleep
    }

    override suspend fun saveSleepPrefs(patch: SleepPrefsPatch): SleepBlockPrefs {
        sleepWrites += patch
        sleepGate?.await()
        failSleep?.let { throw it }
        sleep = patch.applyTo(sleep)
        return sleep
    }
}

/** Routes `viewModelScope` (Dispatchers.Main) to a test dispatcher. */
@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule : TestWatcher() {
    override fun starting(description: Description) = Dispatchers.setMain(UnconfinedTestDispatcher())

    override fun finished(description: Description) = Dispatchers.resetMain()
}
