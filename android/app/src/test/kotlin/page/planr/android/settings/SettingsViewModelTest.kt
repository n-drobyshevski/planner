package page.planr.android.settings

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
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
import page.planr.android.core.data.reminders.ReminderLead
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

    @Test
    fun `quick changes are sent in the order they were made, even on a scope that reorders`() = runTest {
        // The application scope is multi-threaded: two launches may start in
        // either order. This one runs whatever was dispatched last first.
        val reordering = LastFirstDispatcher()
        val vm = SettingsViewModel(data, CoroutineScope(reordering))
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect {} }
        runCurrent()
        val gate = CompletableDeferred<Unit>()
        data.sleepGate = gate
        data.memberGate = gate

        vm.setNightStart(21)
        vm.setNightStart(22)
        vm.setNightStart(23)
        vm.setTimezone("Asia/Tokyo")
        vm.setTimezone("America/New_York")
        gate.complete(Unit)
        reordering.drain()
        runCurrent()

        assertEquals(listOf(21, 22, 23), data.sleepWrites.map { (it.nightWindowStartHour as PatchField.Value).value })
        assertEquals(23, (vm.state.value.sleep as SleepSettings.Ready).prefs.nightWindowStartHour)
        assertEquals(
            listOf("Asia/Tokyo", "America/New_York"),
            data.memberWrites.map { (it.timezone as PatchField.Value).value },
        )
        assertEquals("America/New_York", vm.state.value.time?.timezone)
    }

    @Test
    fun `reminders are off by default and turn on at once where notifications are allowed`() = runTest {
        val vm = subject()
        assertEquals(ReminderSettings(ReminderLead.Off, blocked = false), vm.state.value.reminders)

        vm.setReminderLead(ReminderLead.Ten)
        runCurrent()

        assertEquals(ReminderSettings(ReminderLead.Ten, blocked = false), vm.state.value.reminders)
        assertEquals(listOf(ReminderLead.Ten), data.reminderWrites)
        assertFalse(vm.state.value.askNotificationPermission)
    }

    @Test
    fun `turning reminders on without permission asks for it first, and a yes saves the choice`() = runTest {
        data.allowed = false
        val vm = subject()

        vm.setReminderLead(ReminderLead.Fifteen)
        runCurrent()
        assertTrue(vm.state.value.askNotificationPermission)
        assertEquals(ReminderSettings(ReminderLead.Fifteen, blocked = false), vm.state.value.reminders, "shown while asking")
        assertEquals(emptyList(), data.reminderWrites, "nothing saved yet")

        vm.onNotificationPermissionAsked()
        runCurrent()
        assertFalse(vm.state.value.askNotificationPermission, "asked once")

        data.allowed = true
        vm.onNotificationPermissionResult(granted = true)
        runCurrent()
        assertEquals(listOf(ReminderLead.Fifteen), data.reminderWrites)
        assertEquals(ReminderSettings(ReminderLead.Fifteen, blocked = false), vm.state.value.reminders)
    }

    @Test
    fun `a denied permission puts reminders back to Off with the blocked line, until notifications are allowed`() = runTest {
        data.allowed = false
        data.reminderLead.value = ReminderLead.Five // on before notifications were blocked
        val vm = subject()
        assertTrue(vm.state.value.reminders.blocked, "on, but nothing can show")

        vm.setReminderLead(ReminderLead.Ten)
        vm.onNotificationPermissionAsked()
        vm.onNotificationPermissionResult(granted = false)
        runCurrent()

        assertEquals(ReminderSettings(ReminderLead.Off, blocked = true), vm.state.value.reminders)
        assertEquals(listOf(ReminderLead.Off), data.reminderWrites)

        // Back from the system's settings with notifications allowed: the line goes.
        data.allowed = true
        vm.refreshNotificationAccess()
        runCurrent()
        assertEquals(ReminderSettings(ReminderLead.Off, blocked = false), vm.state.value.reminders)
    }

    @Test
    fun `before Android 13 blocked notifications can't be asked for, so the line shows straight away`() = runTest {
        data.allowed = false
        data.canAsk = false
        val vm = subject()

        vm.setReminderLead(ReminderLead.Thirty)
        runCurrent()

        assertFalse(vm.state.value.askNotificationPermission)
        assertEquals(ReminderSettings(ReminderLead.Off, blocked = true), vm.state.value.reminders)

        vm.setReminderLead(ReminderLead.Off)
        runCurrent()
        assertFalse(vm.state.value.reminders.blocked, "choosing Off clears it")
    }

    @Test
    fun `the opt-in notifications are off by default and turn on at once where notifications are allowed`() = runTest {
        val vm = subject()
        assertEquals(NotifySettings(), vm.state.value.notify)

        vm.setNewRequestsNotify(true)
        vm.setPartnerChangesNotify(true)
        runCurrent()

        assertEquals(NotifySettings(newRequests = true, partnerChanges = true), vm.state.value.notify)
        assertEquals(listOf("requests" to true, "partner" to true), data.notifyWrites)
        assertFalse(vm.state.value.askNotificationPermission)
    }

    @Test
    fun `an opt-in notification goes through the same permission request as reminders`() = runTest {
        data.allowed = false
        val vm = subject()

        vm.setPartnerChangesNotify(true)
        runCurrent()
        assertTrue(vm.state.value.askNotificationPermission)
        assertEquals(NotifySettings(partnerChanges = true), vm.state.value.notify, "shown while asking")
        assertEquals(emptyList(), data.notifyWrites)

        vm.onNotificationPermissionAsked()
        data.allowed = true
        vm.onNotificationPermissionResult(granted = true)
        runCurrent()
        assertEquals(listOf("partner" to true), data.notifyWrites)
        assertEquals(NotifySettings(partnerChanges = true), vm.state.value.notify)
        assertEquals(emptyList(), data.reminderWrites, "the answer was only for this switch")
    }

    @Test
    fun `a refused opt-in goes back off with the section's blocked line, leaving reminders alone`() = runTest {
        data.allowed = false
        val vm = subject()

        vm.setNewRequestsNotify(true)
        vm.onNotificationPermissionAsked()
        vm.onNotificationPermissionResult(granted = false)
        runCurrent()

        assertEquals(NotifySettings(newRequests = false, blocked = true), vm.state.value.notify)
        assertEquals(listOf("requests" to false), data.notifyWrites)
        assertFalse(vm.state.value.reminders.blocked)

        vm.setNewRequestsNotify(false)
        runCurrent()
        assertFalse(vm.state.value.notify.blocked, "choosing off clears it")
    }

    @Test
    fun `a second switch turned on while the first one waits takes over the request`() = runTest {
        data.allowed = false
        val vm = subject()

        vm.setNewRequestsNotify(true)
        vm.setReminderLead(ReminderLead.Ten)
        runCurrent()
        assertEquals(NotifySettings(), vm.state.value.notify, "the first one shows its stored value again")
        assertEquals(ReminderLead.Ten, vm.state.value.reminders.lead)

        data.allowed = true
        vm.onNotificationPermissionResult(granted = true)
        runCurrent()
        assertEquals(listOf(ReminderLead.Ten), data.reminderWrites)
        assertEquals(emptyList(), data.notifyWrites)
    }

    @Test
    fun `a setting whose own channel is off stays on, with its blocked line alone`() = runTest {
        data.channelsOff += NotifyKind.Reminders
        val vm = subject()

        vm.setReminderLead(ReminderLead.Ten)
        vm.setPartnerChangesNotify(true)
        runCurrent()

        assertFalse(vm.state.value.askNotificationPermission, "the permission is granted: nothing to ask")
        assertEquals(ReminderSettings(ReminderLead.Ten, blocked = true), vm.state.value.reminders)
        assertEquals(NotifySettings(partnerChanges = true), vm.state.value.notify)

        // Back from the system's settings with the channel on again.
        data.channelsOff.clear()
        vm.refreshNotificationAccess()
        runCurrent()
        assertFalse(vm.state.value.reminders.blocked)
    }

    @Test
    fun `a permission answer with nothing pending is ignored`() = runTest {
        val vm = subject()
        vm.onNotificationPermissionResult(granted = false)
        runCurrent()
        assertEquals(ReminderSettings(), vm.state.value.reminders)
        assertEquals(emptyList(), data.reminderWrites)
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
    override val reminderLead = MutableStateFlow(ReminderLead.Off)
    val reminderWrites = mutableListOf<ReminderLead>()
    var allowed = true
    var canAsk = true

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

    override suspend fun setReminderLead(lead: ReminderLead) {
        reminderWrites += lead
        reminderLead.value = lead
    }

    override val newRequestsNotify = MutableStateFlow(false)
    override val partnerChangesNotify = MutableStateFlow(false)
    val notifyWrites = mutableListOf<Pair<String, Boolean>>()

    override suspend fun setNewRequestsNotify(on: Boolean) {
        notifyWrites += "requests" to on
        newRequestsNotify.value = on
    }

    override suspend fun setPartnerChangesNotify(on: Boolean) {
        notifyWrites += "partner" to on
        partnerChangesNotify.value = on
    }

    override fun notificationsAllowed(): Boolean = allowed

    /** Channels turned off in the system's settings. */
    val channelsOff = mutableSetOf<NotifyKind>()

    override fun canShow(kind: NotifyKind): Boolean = allowed && kind !in channelsOff

    override val canRequestNotifications: Boolean get() = canAsk

    override suspend fun saveSleepPrefs(patch: SleepPrefsPatch): SleepBlockPrefs {
        sleepWrites += patch
        sleepGate?.await()
        failSleep?.let { throw it }
        sleep = patch.applyTo(sleep)
        return sleep
    }
}

/** Holds dispatched work until [drain], then runs the newest first. */
private class LastFirstDispatcher : CoroutineDispatcher() {
    private val queue = ArrayDeque<Runnable>()

    override fun dispatch(context: CoroutineContext, block: Runnable) {
        queue.addLast(block)
    }

    fun drain() {
        while (queue.isNotEmpty()) queue.removeLast().run()
    }
}

/** Routes `viewModelScope` (Dispatchers.Main) to a test dispatcher. */
@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule : TestWatcher() {
    override fun starting(description: Description) = Dispatchers.setMain(UnconfinedTestDispatcher())

    override fun finished(description: Description) = Dispatchers.resetMain()
}
