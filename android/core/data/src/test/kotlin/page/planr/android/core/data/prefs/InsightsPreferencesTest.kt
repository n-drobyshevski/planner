@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.prefs

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

/** The Insights filters on a real Preferences DataStore file. */
class InsightsPreferencesTest {
    private val dir: File = Files.createTempDirectory("planr-insights").toFile()

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    /** One DataStore per file per process (DataStore enforces it), so one per test. */
    private fun TestScope.prefs() = DataStoreInsightsPreferences(
        // The factory rejects a file whose name doesn't end in .preferences_pb.
        PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { File(dir, "insights_test.preferences_pb") }),
        changes = { edit -> edit() },
    )

    @Test
    fun `defaults to nothing hidden and inactive blocks left out`() = runTest {
        assertEquals(InsightsFilterPrefs(emptySet(), includeInactive = false), prefs().filters("anna").first())
    }

    @Test
    fun `filters round-trip per viewer`() = runTest {
        val prefs = prefs()
        prefs.setHiddenCategories("anna", setOf("work", "gym"))
        prefs.setIncludeInactive("anna", true)

        assertEquals(InsightsFilterPrefs(setOf("work", "gym"), includeInactive = true), prefs.filters("anna").first())
        // Another viewer on the same device keeps their own (default) filters.
        assertEquals(InsightsFilterPrefs(), prefs.filters("boris").first())

        prefs.setHiddenCategories("anna", emptySet())
        assertEquals(InsightsFilterPrefs(emptySet(), includeInactive = true), prefs.filters("anna").first())
    }

    @Test
    fun `emits only when the viewer's own filters change`() = runTest {
        val prefs = prefs()
        val seen = mutableListOf<InsightsFilterPrefs>()
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { prefs.filters("anna").toList(seen) }
        runCurrent()

        prefs.setIncludeInactive("boris", true) // someone else's change
        prefs.setIncludeInactive("anna", false) // same value as the default
        runCurrent()
        prefs.setIncludeInactive("anna", true)
        runCurrent()

        assertEquals(listOf(InsightsFilterPrefs(), InsightsFilterPrefs(includeInactive = true)), seen)
        job.cancel()
    }
}
