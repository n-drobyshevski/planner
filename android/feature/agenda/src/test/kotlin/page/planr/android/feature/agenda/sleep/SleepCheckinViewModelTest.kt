package page.planr.android.feature.agenda.sleep

import androidx.lifecycle.viewModelScope
import java.io.IOException
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import org.junit.Rule
import org.junit.Test
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepTimesSource
import page.planr.android.core.design.R as DesignR
import page.planr.android.feature.agenda.FakeAgendaDataSource
import page.planr.android.feature.agenda.Fixtures
import page.planr.android.feature.agenda.MainDispatcherRule
import page.planr.android.feature.agenda.model.AgendaNotices

@OptIn(ExperimentalCoroutinesApi::class)
class SleepCheckinViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val data = FakeAgendaDataSource()
    private val notices = AgendaNotices()
    private val oct6 = LocalDate(2026, 10, 6)

    /** Last night from the tracker: 23:40 → 07:10 in Berlin (UTC+2). */
    private val deviceNight = SleepLog(
        date = oct6,
        bedtimeAt = Instant.parse("2026-10-05T21:40:00Z"),
        wokeAt = Instant.parse("2026-10-06T05:10:00Z"),
        timesSource = SleepTimesSource.HealthConnect,
        asleepMin = 420,
    )

    /** [at] is Berlin wall time on 6 October 2026. */
    private fun TestScope.viewModel(
        sleep: FakeSleepLogRepository,
        at: String = "09:30",
        clock: Clock = Fixtures.clockAt("2026-10-06T${at}:00+02:00"),
    ): SleepCheckinViewModel {
        val vm = SleepCheckinViewModel(sleep, data, notices, clock)
        backgroundScope.launch { vm.state.collect {} }
        runCurrent()
        return vm
    }

    private fun SleepCheckinViewModel.close() = viewModelScope.cancel()

    @Test
    fun `asks about an unrated device night in the morning, with its times`() = runTest {
        val sleep = FakeSleepLogRepository(listOf(deviceNight))
        val vm = viewModel(sleep)

        assertEquals(1, sleep.refreshes)
        assertEquals(SleepCheckinCard(oct6, LocalTime(23, 40), LocalTime(7, 10)), vm.state.value.card)
        vm.close()
    }

    @Test
    fun `asks without times when there is no night at all`() = runTest {
        val vm = viewModel(FakeSleepLogRepository())

        assertEquals(SleepCheckinCard(oct6), vm.state.value.card)
        vm.close()
    }

    @Test
    fun `stays quiet once last night is rated`() = runTest {
        val vm = viewModel(FakeSleepLogRepository(listOf(deviceNight.copy(fatigue = 4))))

        assertNull(vm.state.value.card)
        vm.close()
    }

    @Test
    fun `stays quiet from 18 00 and in the small hours`() = runTest {
        val evening = viewModel(FakeSleepLogRepository(listOf(deviceNight)), at = "18:00")
        assertNull(evening.state.value.card)
        evening.close()

        val night = viewModel(FakeSleepLogRepository(listOf(deviceNight)), at = "03:59")
        assertNull(night.state.value.card)
        night.close()

        val lastMinute = viewModel(FakeSleepLogRepository(listOf(deviceNight)), at = "17:59")
        assertNotNull(lastMinute.state.value.card)
        lastMinute.close()
    }

    @Test
    fun `an older night's rating doesn't hide today's card`() = runTest {
        val yesterday = deviceNight.copy(date = LocalDate(2026, 10, 5), quality = 6)
        val vm = viewModel(FakeSleepLogRepository(listOf(yesterday)))

        assertEquals(SleepCheckinCard(oct6), vm.state.value.card)
        vm.close()
    }

    @Test
    fun `dismissing hides the card for today only`() = runTest {
        val sleep = FakeSleepLogRepository(listOf(deviceNight))
        val vm = viewModel(sleep)

        vm.dismissCard()
        runCurrent()

        assertEquals(oct6, sleep.checkinDismissedOn.value)
        assertNull(vm.state.value.card)
        vm.close()

        // Dismissed yesterday: today asks again.
        sleep.checkinDismissedOn.value = LocalDate(2026, 10, 5)
        val next = viewModel(sleep)
        assertNotNull(next.state.value.card)
        next.close()
    }

    @Test
    fun `nothing shows while signed out`() = runTest {
        data.session = null
        val sleep = FakeSleepLogRepository(listOf(deviceNight))
        val vm = viewModel(sleep)

        assertEquals(0, sleep.refreshes)
        assertNull(vm.state.value.card)
        vm.close()
    }

    @Test
    fun `the sheet opens on the device times and saving hides the card`() = runTest {
        val sleep = FakeSleepLogRepository(listOf(deviceNight))
        val vm = viewModel(sleep)
        val received = mutableListOf<Int>()
        backgroundScope.launch { notices.notices.collect { received += it.message.id } }

        vm.openSheet()
        val sheet = assertNotNull(vm.state.value.sheet)
        assertEquals(LocalTime(23, 40), sheet.form.bedtime)
        assertEquals(LocalTime(7, 10), sheet.form.wake)
        assertTrue(sheet.form.fromHealthConnect)

        vm.updateDraft(sheet.form.toDraft().copy(quality = 6, fatigue = 3))
        vm.save()
        runCurrent()

        val rating = sleep.saved.single()
        assertEquals(6, rating.quality)
        assertEquals(3, rating.fatigue)
        assertFalse(rating.timesEdited)
        // The device's times stay on the night.
        assertEquals(SleepTimesSource.HealthConnect, sleep.recentLogs.first()!!.single().timesSource)
        assertNull(vm.state.value.sheet)
        assertNull(vm.state.value.card)
        assertEquals(listOf(DesignR.string.sleep_rating_saved), received)
        vm.close()
    }

    @Test
    fun `a manual check-in sends the typed times, and a failed save keeps the sheet open`() = runTest {
        val sleep = FakeSleepLogRepository()
        val vm = viewModel(sleep)

        vm.openSheet()
        val draft = vm.state.value.sheet!!.form.toDraft()
        assertEquals(23 * 60, draft.bedtimeMinutes)
        assertEquals(7 * 60, draft.wakeMinutes)
        vm.updateDraft(draft.copy(bedtimeMinutes = 22 * 60 + 30, timesEdited = true, quality = 4))
        sleep.failSave = IOException("offline")
        vm.save()
        runCurrent()

        val failed = assertNotNull(vm.state.value.sheet)
        assertTrue(failed.failed)
        assertFalse(failed.saving)
        assertNotNull(vm.state.value.card)

        vm.save()
        runCurrent()

        val rating = sleep.saved.single()
        assertEquals(Instant.parse("2026-10-05T20:30:00Z"), rating.times?.bedtimeAt)
        assertEquals(Instant.parse("2026-10-06T05:00:00Z"), rating.times?.wokeAt)
        assertNull(vm.state.value.card)
        vm.close()
    }

    @Test
    fun `the card leaves at 18 00 while the agenda stays open`() = runTest {
        var now = Instant.parse("2026-10-06T17:59:30+02:00")
        val clock = object : Clock {
            override fun now(): Instant = now
        }
        val vm = viewModel(FakeSleepLogRepository(listOf(deviceNight)), clock = clock)
        assertNotNull(vm.state.value.card)

        now = Instant.parse("2026-10-06T18:00:00+02:00")
        advanceTimeBy(30_001)
        runCurrent()

        assertNull(vm.state.value.card)
        vm.close()
    }

    @Test
    fun `saving only the times still answers for today`() = runTest {
        val sleep = FakeSleepLogRepository()
        val vm = viewModel(sleep)

        vm.openSheet()
        vm.save()
        runCurrent()

        assertNull(sleep.recentLogs.value!!.single().quality)
        assertEquals(oct6, sleep.checkinDismissedOn.value)
        assertNull(vm.state.value.sheet)
        assertNull(vm.state.value.card)
        vm.close()
    }

    @Test
    fun `a wake before the bedtime is caught before saving`() = runTest {
        val sleep = FakeSleepLogRepository()
        val vm = viewModel(sleep)

        vm.openSheet()
        val draft = vm.state.value.sheet!!.form.toDraft()
        // 08:00 bedtime is on the wake date, after the 07:00 wake.
        vm.updateDraft(draft.copy(bedtimeMinutes = 8 * 60, timesEdited = true, quality = 5))
        vm.save()
        runCurrent()

        val sheet = assertNotNull(vm.state.value.sheet)
        assertTrue(sheet.timesOutOfOrder)
        assertFalse(sheet.saving)
        assertTrue(sleep.saved.isEmpty())

        vm.updateDraft(sheet.form.toDraft().copy(bedtimeMinutes = 23 * 60))
        assertFalse(vm.state.value.sheet!!.timesOutOfOrder)
        vm.save()
        runCurrent()
        assertEquals(1, sleep.saved.size)
        vm.close()
    }
}
