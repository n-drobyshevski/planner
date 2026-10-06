package page.planr.android.feature.insights.sleep

import androidx.lifecycle.viewModelScope
import java.io.IOException
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRating
import page.planr.android.core.data.model.SleepTimesSource
import page.planr.android.core.data.repository.SleepLogRepository
import page.planr.android.feature.insights.FakeInsightsDataSource
import page.planr.android.feature.insights.MainDispatcherRule
import page.planr.android.feature.insights.keepCollecting

@OptIn(ExperimentalCoroutinesApi::class)
class SleepNightsViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val oct6 = LocalDate(2026, 10, 6)

    /** 6 October 2026, 09:30 in Berlin. */
    private val clock = object : Clock {
        override fun now(): Instant = Instant.parse("2026-10-06T07:30:00Z")
    }

    private class FakeSleep(var stored: List<SleepLog>) : SleepLogRepository {
        override val recentLogs = MutableStateFlow<List<SleepLog>?>(null)
        override val checkinDismissedOn = MutableStateFlow<LocalDate?>(null)
        val saved = mutableListOf<SleepRating>()
        var failRefresh: Exception? = null
        var failSave: Exception? = null

        override suspend fun refresh(force: Boolean) {
            failRefresh?.let { throw it }
            recentLogs.value = stored
        }

        override suspend fun save(rating: SleepRating): SleepLog {
            failSave?.let { failSave = null; throw it }
            saved += rating
            val log = (stored.firstOrNull { it.date == rating.date } ?: SleepLog(rating.date)).copy(quality = rating.quality)
            stored = stored.filterNot { it.date == rating.date } + log
            recentLogs.value = stored
            return log
        }

        override suspend fun dismissCheckin(date: LocalDate) = Unit
    }

    private val deviceNight = SleepLog(
        date = oct6,
        bedtimeAt = Instant.parse("2026-10-05T21:40:00Z"),
        wokeAt = Instant.parse("2026-10-06T05:10:00Z"),
        timesSource = SleepTimesSource.HealthConnect,
        deepMin = 80,
    )

    private fun TestScope.viewModel(sleep: FakeSleep): SleepNightsViewModel {
        val vm = SleepNightsViewModel(sleep, FakeInsightsDataSource(), clock)
        keepCollecting(vm.state)
        runCurrent()
        return vm
    }

    @Test
    fun `reads only once shown, then lists the viewer's nights`() = runTest {
        val sleep = FakeSleep(listOf(deviceNight, SleepLog(LocalDate(2026, 9, 1), quality = 5)))
        val vm = viewModel(sleep)
        assertNull(vm.state.value.model)

        vm.onShown()
        runCurrent()

        val nights = assertNotNull(vm.state.value.model).nights
        assertEquals(listOf(oct6), nights.map { it.date })
        assertEquals(LocalTime(23, 40), nights.single().bedtime)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `a failed read shows the error, and a retry clears it`() = runTest {
        val sleep = FakeSleep(listOf(deviceNight)).apply { failRefresh = IOException("offline") }
        val vm = viewModel(sleep)

        vm.onShown()
        runCurrent()
        assertTrue(vm.state.value.loadFailed)
        assertNull(vm.state.value.model)

        sleep.failRefresh = null
        vm.refresh()
        runCurrent()
        assertFalse(vm.state.value.loadFailed)
        assertFalse(vm.state.value.isRefreshing)
        assertNotNull(vm.state.value.model)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `tapping a night opens it in the sheet, and saving rates it`() = runTest {
        val sleep = FakeSleep(listOf(deviceNight))
        val vm = viewModel(sleep)
        vm.onShown()
        runCurrent()

        vm.openNight(oct6)
        val sheet = assertNotNull(vm.state.value.sheet)
        assertTrue(sheet.form.fromHealthConnect)
        assertEquals(LocalTime(7, 10), sheet.form.wake)

        vm.updateDraft(sheet.form.toDraft().copy(quality = 2))
        sleep.failSave = IOException("offline")
        vm.save()
        runCurrent()
        assertTrue(assertNotNull(vm.state.value.sheet).failed)

        vm.save()
        runCurrent()
        assertNull(vm.state.value.sheet)
        assertFalse(sleep.saved.single().timesEdited)
        assertEquals(2, vm.state.value.model?.nights?.single()?.quality)
        vm.viewModelScope.cancel()
    }

    @Test
    fun `edited times that wake before the bedtime are not sent`() = runTest {
        val sleep = FakeSleep(listOf(deviceNight))
        val vm = viewModel(sleep)
        vm.onShown()
        runCurrent()

        vm.openNight(oct6)
        val draft = vm.state.value.sheet!!.form.toDraft()
        vm.updateDraft(draft.copy(bedtimeMinutes = 9 * 60, timesEdited = true))
        vm.save()
        runCurrent()

        assertTrue(assertNotNull(vm.state.value.sheet).timesOutOfOrder)
        assertTrue(sleep.saved.isEmpty())
        vm.viewModelScope.cancel()
    }
}
