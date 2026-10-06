@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package page.planr.android.core.data.appearance

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import page.planr.android.core.model.Member
import page.planr.android.core.model.ThemePreference

/** [MemberAppearanceApplier] over a fake platform and a real appearance DataStore file. */
class MemberAppearanceApplierTest {
    private val dir: File = Files.createTempDirectory("planr-appearance").toFile()

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private class FakePlatform : AppearancePlatform {
        val nightModes = mutableListOf<ThemePreference>()

        override fun setNightMode(preference: ThemePreference) {
            nightModes += preference
        }
    }

    private val platform = FakePlatform()
    private val member = MutableStateFlow<Member?>(null)

    private fun me(theme: ThemePreference = ThemePreference.System, name: String = "Anna") =
        Member(id = "m1", workspaceId = "ws", name = name, color = "#c2410c", themePreference = theme)

    /** One DataStore per file per process (DataStore enforces it), so one per test. */
    private fun TestScope.store() = ThemeModeStore(
        PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { File(dir, "appearance_test.preferences_pb") }),
        backgroundScope,
    )

    private fun TestScope.applier(store: ThemeModeStore) =
        MemberAppearanceApplier({ member }, store, platform, backgroundScope).also { it.start() }

    @Test
    fun `signed out, nothing is applied`() = runTest {
        applier(store())
        runCurrent()

        assertEquals(emptyList(), platform.nightModes)
    }

    @Test
    fun `the member's theme is applied and remembered`() = runTest {
        val store = store()
        applier(store)
        member.value = me(ThemePreference.Dark)
        runCurrent()

        assertEquals(listOf(ThemePreference.Dark), platform.nightModes)
        assertEquals(ThemePreference.Dark, store.lastApplied())

        member.value = me(ThemePreference.Light)
        runCurrent()

        assertEquals(listOf(ThemePreference.Dark, ThemePreference.Light), platform.nightModes)
        assertEquals(ThemePreference.Light, store.lastApplied())
    }

    @Test
    fun `other changes to the member's row leave the theme alone`() = runTest {
        applier(store())
        member.value = me(ThemePreference.Dark)
        runCurrent()
        member.value = me(ThemePreference.Dark, name = "Anya")
        runCurrent()

        assertEquals(listOf(ThemePreference.Dark), platform.nightModes)
    }

    @Test
    fun `a theme already applied on a previous run is not applied again`() = runTest {
        val store = store()
        store.save(ThemePreference.Dark)
        applier(store)
        member.value = me(ThemePreference.Dark)
        runCurrent()

        assertEquals(emptyList(), platform.nightModes)
    }

    @Test
    fun `signing out keeps the last theme`() = runTest {
        val store = store()
        applier(store)
        member.value = me(ThemePreference.Dark)
        runCurrent()
        member.value = null
        runCurrent()

        assertEquals(listOf(ThemePreference.Dark), platform.nightModes)
        assertEquals(ThemePreference.Dark, store.lastApplied())
    }
}
