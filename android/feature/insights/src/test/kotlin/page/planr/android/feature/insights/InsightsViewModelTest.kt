package page.planr.android.feature.insights

import androidx.lifecycle.SavedStateHandle
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import page.planr.android.core.data.prefs.InsightsFilterPrefs
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.PeriodPreset
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.ResolvedPeriod
import page.planr.android.core.insights.model.toTimeWindow
import page.planr.android.core.insights.period.Periods
import page.planr.android.core.model.TimeWindow

@OptIn(ExperimentalCoroutinesApi::class)
class InsightsViewModelTest {
    @get:Rule val main = MainDispatcherRule(StandardTestDispatcher())

    private val clock = FixedClock()
    private val factory = FakeModelFactory()

    private fun viewModel(data: FakeInsightsDataSource, saved: SavedStateHandle = SavedStateHandle()) =
        InsightsViewModel(data, factory, clock, saved, main.dispatcher)

    private fun test(block: suspend TestScope.() -> Unit) = runTest(main.dispatcher.scheduler) { block() }

    /**
     * Subscribes like the screen does; cancel the job to leave it. Started at
     * once: `advanceUntilIdle` alone never runs background-scope work when no
     * foreground task is pending, so a resubscription would otherwise not happen.
     */
    private fun TestScope.open(vm: InsightsViewModel, onState: (InsightsUiState) -> Unit = {}): Job =
        backgroundScope.launch { vm.state.collect { onState(it) } }.also { runCurrent() }

    private fun resolve(state: PeriodState = PeriodState(), zone: ZoneId = BERLIN, now: Long = NOW_MS): ResolvedPeriod =
        Periods.resolve(state, zone, now)

    private fun unionOf(p: ResolvedPeriod): TimeWindow = Periods.unionWindow(p).toTimeWindow()

    private fun InsightsViewModel.spanKeys(): Set<String> = factory.lastInputs.spans.map { it.key }.toSet()

    @Test
    fun `defaults - Overview, this week, by day, resolved in the viewer's zone`() = test {
        val vm = viewModel(FakeInsightsDataSource())
        open(vm)
        advanceUntilIdle()

        val s = vm.state.value
        val expected = resolve()
        assertEquals(InsightsTab.Overview, s.tab)
        assertEquals(BERLIN, s.zone)
        assertEquals(
            PeriodUi(
                preset = PeriodPreset.ThisWeek,
                requestedGranularity = Granularity.Day,
                granularity = Granularity.Day,
                choices = Periods.granularityChoices(expected.window),
                window = expected.window,
                firstDay = LocalDate.of(2026, 9, 28),
                lastDay = LocalDate.of(2026, 10, 4),
                clamped = false,
            ),
            s.period,
        )
        assertIs<TabContent.Overview>(s.content)
        assertEquals(InsightsTab.Overview, factory.calls.single().first, "only the active tab is computed")
    }

    @Test
    fun `one union refresh after the debounce, and only the last of two quick changes`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        open(vm)
        runCurrent()
        advanceTimeBy(250)
        assertEquals(emptyList(), data.refreshedWindows, "debounced")
        advanceUntilIdle()
        assertEquals(listOf(unionOf(resolve())), data.refreshedWindows)

        vm.selectPreset(PeriodPreset.LastWeek)
        advanceTimeBy(100)
        vm.selectPreset(PeriodPreset.Last30d)
        advanceUntilIdle()

        assertEquals(
            listOf(unionOf(resolve()), unionOf(resolve(PeriodState(PeriodPreset.Last30d)))),
            data.refreshedWindows,
        )
    }

    @Test
    fun `occurrences are read untracked, per window, and nothing else`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()

        // The data source's observeOccurrences is the untracked read (RepositoryInsightsDataSource
        // delegates to OccurrenceRepository.observeUntracked); the VM reaches Room through nothing else.
        val p = resolve()
        assertEquals(setOf(p.window.toTimeWindow(), p.prevWindow.toTimeWindow()), data.observedWindows.toSet())
        assertEquals(listOf(unionOf(p)), data.refreshedWindows)
    }

    @Test
    fun `filters - hidden categories, inactive blocks and the partner's solo items`() = test {
        val data = FakeInsightsDataSource(
            occurrences = listOf(
                occurrence("work", category = annaWork.id),
                occurrence("home", category = sharedHome.id),
                occurrence("sleep", inactive = true),
                occurrence("boris-solo", owner = BORIS),
                occurrence("joint", owner = BORIS, shared = true),
            ),
        )
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()
        assertEquals(setOf("work", "home", "joint"), vm.spanKeys(), "partner solo and inactive dropped by default")

        vm.setCategoryHidden(sharedHome.id, true)
        advanceUntilIdle()
        assertEquals(setOf("work", "joint"), vm.spanKeys())
        assertEquals(setOf(sharedHome.id), data.filters.value.getValue(ANNA).hiddenCategoryIds)

        vm.setIncludeInactive(true)
        advanceUntilIdle()
        assertEquals(setOf("work", "joint", "sleep"), vm.spanKeys())

        val filters = vm.state.value.filters
        assertEquals(listOf(sharedHome.id to true, annaWork.id to false), filters.categories.map { it.id to it.hidden })
        assertTrue(filters.includeInactive)
        assertEquals(2, filters.activeCount)

        vm.setCategoryHidden(sharedHome.id, false)
        advanceUntilIdle()
        assertEquals(setOf("work", "home", "joint", "sleep"), vm.spanKeys())
    }

    @Test
    fun `the task slice is what the viewer owns or is assigned`() = test {
        val data = FakeInsightsDataSource(
            tasks = listOf(
                taskRow("mine"),
                taskRow("assigned-to-me", owner = BORIS, assignee = ANNA),
                taskRow("borises", owner = BORIS),
                taskRow("borises-assigned", owner = BORIS, assignee = BORIS),
            ),
        )
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()

        assertEquals(listOf("mine", "assigned-to-me"), factory.lastInputs.tasks.map { it.id })
    }

    @Test
    fun `custom range - swapped, clamped, stored at noon and restored after process death`() = test {
        val data = FakeInsightsDataSource()
        val saved = SavedStateHandle()
        val vm = viewModel(data, saved)
        open(vm)
        advanceUntilIdle()

        vm.setCustomRange(LocalDate.of(2026, 9, 20), LocalDate.of(2026, 9, 10))
        advanceUntilIdle()
        var period = assertNotNull(vm.state.value.period)
        assertEquals(PeriodPreset.Custom, period.preset)
        assertEquals(LocalDate.of(2026, 9, 10), period.firstDay)
        assertEquals(LocalDate.of(2026, 9, 20), period.lastDay)
        assertEquals(Instant.parse("2026-09-20T10:00:00Z").toEpochMilliseconds(), saved["insights.customFrom"])
        assertFalse(period.clamped)

        vm.setCustomRange(LocalDate.of(2025, 8, 1), LocalDate.of(2026, 9, 4))
        advanceUntilIdle()
        period = assertNotNull(vm.state.value.period)
        assertTrue(period.clamped)
        assertEquals(LocalDate.of(2025, 9, 4), period.firstDay, "the most recent 366 days")
        assertEquals(LocalDate.of(2026, 9, 4), period.lastDay)

        val restored = viewModel(data, SavedStateHandle(saved.keys().associateWith { saved.get<Any?>(it) }))
        open(restored)
        advanceUntilIdle()
        assertEquals(period, restored.state.value.period)
    }

    @Test
    fun `granularity - the request is kept, the effective one follows the window`() = test {
        val saved = SavedStateHandle()
        val vm = viewModel(FakeInsightsDataSource(), saved)
        open(vm)
        advanceUntilIdle()

        vm.selectGranularity(Granularity.Week)
        advanceUntilIdle()
        var period = assertNotNull(vm.state.value.period)
        assertEquals(Granularity.Day, period.granularity, "a 7-day window offers Day only")
        assertEquals(Granularity.Week, period.requestedGranularity)
        assertEquals(listOf(Granularity.Day), period.choices)
        assertEquals("week", saved["insights.granularity"])

        vm.selectPreset(PeriodPreset.Last30d)
        advanceUntilIdle()
        period = assertNotNull(vm.state.value.period)
        assertEquals(Granularity.Week, period.granularity)
    }

    @Test
    fun `rollover - a new local day re-resolves and refreshes, the same day does nothing`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()
        assertEquals(1, data.refreshedWindows.size)

        // 22:00 in Berlin, still Sunday (already Monday in the JVM's Chatham default).
        clock.instant = Instant.parse("2026-10-04T20:00:00Z")
        vm.checkRollover()
        advanceUntilIdle()
        assertEquals(NOW_MS, vm.state.value.now)
        assertEquals(1, data.refreshedWindows.size)

        // 00:30 Monday in Berlin: a new week.
        clock.instant = Instant.parse("2026-10-04T22:30:00Z")
        vm.checkRollover()
        advanceUntilIdle()
        val monday = clock.instant.toEpochMilliseconds()
        assertEquals(monday, vm.state.value.now)
        assertEquals(LocalDate.of(2026, 10, 5), vm.state.value.period?.firstDay)
        assertEquals(unionOf(resolve(now = monday)), data.refreshedWindows.last())
        assertEquals(2, data.refreshedWindows.size)
    }

    @Test
    fun `loading until the first refresh lands over an empty cache`() = test {
        val gate = CompletableDeferred<Unit>()
        val data = FakeInsightsDataSource().apply { refreshGate = gate }
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()
        assertEquals(TabContent.Loading, vm.state.value.content)

        gate.complete(Unit)
        advanceUntilIdle()
        assertIs<TabContent.Overview>(vm.state.value.content)
        assertFalse(vm.state.value.refreshFailed)
    }

    @Test
    fun `a failed first refresh over an empty cache is Failed, and retry recovers`() = test {
        val data = FakeInsightsDataSource().apply { failRefreshWith = IOException("offline") }
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()
        assertIs<TabContent.Failed>(vm.state.value.content)
        assertTrue(vm.state.value.refreshFailed)

        data.failRefreshWith = null
        vm.retry()
        advanceUntilIdle()
        assertIs<TabContent.Overview>(vm.state.value.content)
        assertFalse(vm.state.value.refreshFailed)
        assertEquals(2, data.refreshedWindows.size)
    }

    @Test
    fun `a failed refresh over a cached span is silent`() = test {
        val data = FakeInsightsDataSource(occurrences = listOf(occurrence("cached"))).apply {
            failRefreshWith = IOException("offline")
        }
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()

        assertIs<TabContent.Overview>(vm.state.value.content)
        assertFalse(vm.state.value.refreshFailed)
    }

    @Test
    fun `pull-to-refresh reports failure inline and clears it on success`() = test {
        val data = FakeInsightsDataSource(occurrences = listOf(occurrence("cached")))
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()

        val gate = CompletableDeferred<Unit>()
        data.refreshGate = gate
        data.failRefreshWith = IOException("offline")
        vm.refresh()
        runCurrent()
        assertTrue(vm.state.value.isRefreshing)
        gate.complete(Unit)
        advanceUntilIdle()
        assertFalse(vm.state.value.isRefreshing)
        assertTrue(vm.state.value.refreshFailed)
        assertIs<TabContent.Overview>(vm.state.value.content)

        data.failRefreshWith = null
        vm.refresh()
        advanceUntilIdle()
        assertFalse(vm.state.value.refreshFailed)
        assertEquals(2, data.referenceRefreshes)
        assertEquals(unionOf(resolve()), data.refreshedWindows.last())
    }

    @Test
    fun `room emissions within the debounce recompute once`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()
        val before = factory.calls.size

        data.occurrences.value = listOf(occurrence("a"))
        advanceTimeBy(50)
        data.occurrences.value = listOf(occurrence("a"), occurrence("b"))
        advanceTimeBy(50)
        data.occurrences.value = listOf(occurrence("a"), occurrence("b"), occurrence("c"))
        advanceUntilIdle()

        assertEquals(before + 1, factory.calls.size)
        assertEquals(setOf("a", "b", "c"), vm.spanKeys())
    }

    @Test
    fun `the day sheet opens over the current filtered spans and closes`() = test {
        val data = FakeInsightsDataSource(
            occurrences = listOf(occurrence("work", category = annaWork.id), occurrence("home", category = sharedHome.id)),
        )
        data.filters.value = mapOf(ANNA to InsightsFilterPrefs(hiddenCategoryIds = setOf(sharedHome.id)))
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()

        val day = Periods.startOfDay(NOW_MS, BERLIN)
        vm.openDay(day)
        advanceUntilIdle()
        val detail = assertNotNull(vm.state.value.dayDetail)
        assertEquals(listOf("work"), detail.items.map { it.key })
        assertEquals(factory.lastInputs, factory.dayCalls.single().first)
        assertEquals(day, factory.dayCalls.single().second)

        vm.closeDay()
        advanceUntilIdle()
        assertNull(vm.state.value.dayDetail)
    }

    @Test
    fun `comparison and legend toggles are session state`() = test {
        val saved = SavedStateHandle()
        val vm = viewModel(FakeInsightsDataSource(), saved)
        open(vm)
        advanceUntilIdle()

        vm.toggleComparison()
        vm.toggleTrendSeries("cat-work")
        vm.selectTab(InsightsTab.Trends)
        advanceUntilIdle()
        assertTrue(vm.state.value.showComparison)
        assertEquals(setOf("cat-work"), vm.state.value.hiddenTrendSeries)
        assertEquals(InsightsTab.Trends, vm.state.value.tab)
        assertIs<TabContent.Trends>(vm.state.value.content)
        val persisted = setOf("insights.tab", "insights.preset", "insights.customFrom", "insights.customTo", "insights.granularity")
        assertTrue(persisted.containsAll(saved.keys()), "saved: ${saved.keys()}")
        assertEquals(InsightsTab.Trends.name, saved["insights.tab"])

        vm.toggleTrendSeries("cat-work")
        vm.toggleComparison()
        advanceUntilIdle()
        assertEquals(emptySet(), vm.state.value.hiddenTrendSeries)
        assertFalse(vm.state.value.showComparison)
    }

    @Test
    fun `resubscribing never refetches the union, resume refreshes only the current window`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        val p = resolve()
        var screen = open(vm)
        advanceUntilIdle()
        assertEquals(listOf(unionOf(p)), data.refreshedWindows)

        screen.cancel()
        advanceTimeBy(6_000)
        clock.instant = NOW + 16.seconds
        screen = open(vm)
        vm.onResume()
        advanceUntilIdle()
        assertEquals(listOf(unionOf(p)), data.refreshedWindows, "within 30 s: nothing")

        screen.cancel()
        advanceTimeBy(6_000)
        clock.instant = NOW + 70.seconds
        // Coming back shows the last model at once: no skeleton, no header gap (§E.5 scroll state, §H.31).
        val seen = mutableListOf<InsightsUiState>()
        open(vm) { seen += it }
        advanceUntilIdle()
        assertEquals(listOf(unionOf(p)), data.refreshedWindows, "no union refetch on resubscription")
        assertTrue(seen.none { it.content == TabContent.Loading }, "never Loading: ${seen.map { it.content }}")
        assertTrue(seen.all { it.period != null }, "the period header never disappears")

        vm.onResume()
        advanceUntilIdle()
        assertEquals(listOf(unionOf(p), p.window.toTimeWindow()), data.refreshedWindows)

        vm.onResume()
        advanceUntilIdle()
        assertEquals(2, data.refreshedWindows.size, "throttled for 30 s")
    }

    @Test
    fun `signing out and back in while off screen forgets the union and loads again`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        val screen = open(vm)
        advanceUntilIdle()
        assertEquals(listOf(unionOf(resolve())), data.refreshedWindows)
        assertIs<TabContent.Overview>(vm.state.value.content)

        // Off screen (the Insights back stack is saved): sign-out wipes Room, then the same member signs in.
        screen.cancel()
        advanceTimeBy(6_000)
        data.memberId.value = null
        advanceUntilIdle()
        data.memberId.value = ANNA
        advanceUntilIdle()

        val gate = CompletableDeferred<Unit>()
        data.refreshGate = gate
        open(vm)
        advanceUntilIdle()
        assertEquals(listOf(unionOf(resolve()), unionOf(resolve())), data.refreshedWindows, "the union is fetched again")
        assertEquals(TabContent.Loading, vm.state.value.content, "the wiped cache is not shown as data")

        gate.complete(Unit)
        advanceUntilIdle()
        assertIs<TabContent.Overview>(vm.state.value.content)
    }

    @Test
    fun `signing out and back in on screen fetches the union again`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()

        data.memberId.value = null
        advanceUntilIdle()
        assertNull(vm.state.value.period)
        data.memberId.value = ANNA
        advanceUntilIdle()

        assertEquals(listOf(unionOf(resolve()), unionOf(resolve())), data.refreshedWindows)
        assertIs<TabContent.Overview>(vm.state.value.content)
    }

    @Test
    fun `the zone comes from the member row, not the device`() = test {
        val kolkata = ZoneId.of("Asia/Kolkata")
        val data = FakeInsightsDataSource(members = emptyList())
        val vm = viewModel(data)
        open(vm)
        advanceTimeBy(1_000)
        assertNull(vm.state.value.period)
        assertEquals(TabContent.Loading, vm.state.value.content)
        assertEquals(emptyList(), data.refreshedWindows)

        data.members.value = listOf(anna.copy(timezone = "Asia/Kolkata"), boris)
        advanceUntilIdle()

        val expected = resolve(zone = kolkata)
        assertEquals(kolkata, vm.state.value.zone)
        assertEquals(listOf(unionOf(expected)), data.refreshedWindows)
        val union = Periods.unionWindow(expected)
        assertEquals(LocalDate.of(2026, 9, 21).atStartOfDay(kolkata).toInstant().toEpochMilli(), union.start)
        assertEquals(LocalDate.of(2026, 10, 5).atStartOfDay(kolkata).toInstant().toEpochMilli(), union.end)
        assertEquals(kolkata, factory.lastInputs.zone)
    }

    @Test
    fun `custom seeds from the visible window and comes back after another preset`() = test {
        val saved = SavedStateHandle()
        val vm = viewModel(FakeInsightsDataSource(), saved)
        open(vm)
        advanceUntilIdle()
        val week = resolve().window

        vm.selectPreset(PeriodPreset.Custom)
        advanceUntilIdle()
        assertEquals(week.start, saved["insights.customFrom"])
        assertEquals(week.end - 1, saved["insights.customTo"])
        assertEquals(PeriodPreset.Custom, vm.state.value.period?.preset)
        assertEquals(week, vm.state.value.period?.window, "applied immediately")

        vm.setCustomRange(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 10))
        vm.selectPreset(PeriodPreset.LastWeek)
        advanceUntilIdle()
        assertEquals(PeriodPreset.LastWeek, vm.state.value.period?.preset)

        vm.selectPreset(PeriodPreset.Custom)
        advanceUntilIdle()
        val period = assertNotNull(vm.state.value.period)
        assertEquals(LocalDate.of(2026, 9, 1), period.firstDay)
        assertEquals(LocalDate.of(2026, 9, 10), period.lastDay)
    }

    @Test
    fun `off screen, room emissions compute nothing`() = test {
        val data = FakeInsightsDataSource()
        val vm = viewModel(data)
        val screen = open(vm)
        advanceUntilIdle()
        val before = factory.calls.size

        screen.cancel()
        advanceTimeBy(6_000)
        data.occurrences.value = listOf(occurrence("a"))
        advanceTimeBy(1.hours.inWholeMilliseconds)
        data.occurrences.value = listOf(occurrence("b"))
        data.occurrences.value = listOf(occurrence("c"))
        advanceUntilIdle()

        assertEquals(before, factory.calls.size)
    }

    @Test
    fun `an unknown saved state falls back to the defaults`() = test {
        val saved = SavedStateHandle(mapOf("insights.tab" to "Sleep", "insights.preset" to "yesterday", "insights.granularity" to "hour"))
        val vm = viewModel(FakeInsightsDataSource(), saved)
        open(vm)
        advanceUntilIdle()

        assertEquals(InsightsTab.Overview, vm.state.value.tab)
        assertEquals(PeriodPreset.ThisWeek, vm.state.value.period?.preset)
        assertEquals(Granularity.Day, vm.state.value.period?.requestedGranularity)
    }

    @Test
    fun `signed out - no period, loading, no refresh`() = test {
        val data = FakeInsightsDataSource(memberId = null)
        val vm = viewModel(data)
        open(vm)
        advanceUntilIdle()

        assertNull(vm.state.value.period)
        assertEquals(TabContent.Loading, vm.state.value.content)
        assertEquals(emptyList(), data.refreshedWindows)
        assertEquals(emptyList(), data.observedWindows)
    }
}
