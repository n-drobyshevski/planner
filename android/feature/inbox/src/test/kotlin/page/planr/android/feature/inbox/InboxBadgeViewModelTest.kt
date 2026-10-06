package page.planr.android.feature.inbox

import androidx.lifecycle.viewModelScope
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.data.inbox.NightWindow
import page.planr.android.core.data.model.SleepLog

@OptIn(ExperimentalCoroutinesApi::class)
class InboxBadgeViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    /** Every night of the last week rated. */
    private val ratedWeek = listOf(LocalDate(2026, 9, 30)).plus((1..6).map { LocalDate(2026, 10, it) })
        .map { SleepLog(it, quality = 5) }

    @Test
    fun `counts the rows the Inbox shows and follows them as they are resolved`() = runTest {
        val data = FakeInboxDataSource().apply {
            serverLogs = ratedWeek
            serverRequests = listOf(TestData.request("r1"), TestData.request("r2"))
            tasks.value = listOf(TestData.task("tk"))
        }
        val vm = InboxBadgeViewModel(data, TestData.clock)
        keepCollecting(vm.count)
        vm.refresh()
        runCurrent()

        assertEquals(1, data.requestRefreshes)
        assertEquals(1, data.sleepRefreshes)
        // Not forced: a read done moments ago (another tab's badge, the Inbox) is not repeated.
        assertEquals(listOf(false, false), data.refreshForces)
        assertEquals(3, vm.count.value)

        data.markDeclined("r1")
        runCurrent()
        assertEquals(2, vm.count.value)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `today's night counts only once the viewer's wake window is over`() = runTest {
        // 15:00 in Berlin: past the default 12:00, before a 16:00 end.
        val data = FakeInboxDataSource().apply {
            serverLogs = ratedWeek.filterNot { it.date == LocalDate(2026, 10, 6) }
            night = NightWindow(startHour = 20, endHour = 16)
        }
        val vm = InboxBadgeViewModel(data, TestData.clock)
        keepCollecting(vm.count)
        vm.refresh()
        runCurrent()

        assertEquals(0, vm.count.value)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `a night window read that stalls falls back to the defaults instead of holding the count`() = runTest {
        val data = FakeInboxDataSource().apply {
            serverLogs = ratedWeek
            serverRequests = listOf(TestData.request("r1"))
            stallNightWindow = true
        }
        val vm = InboxBadgeViewModel(data, TestData.clock)
        keepCollecting(vm.count)
        vm.refresh()
        runCurrent()
        assertEquals(0, vm.count.value) // still waiting on the read

        advanceTimeBy(NIGHT_WINDOW_BUDGET + 1.milliseconds)
        runCurrent()
        assertEquals(1, vm.count.value)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `stays at zero while signed out`() = runTest {
        val data = FakeInboxDataSource().apply {
            serverRequests = listOf(TestData.request("r1"))
            viewer.value = null
        }
        val vm = InboxBadgeViewModel(data, TestData.clock)
        keepCollecting(vm.count)
        vm.refresh()
        runCurrent()

        assertEquals(0, vm.count.value)
        vm.viewModelScope.cancel()
    }
}
