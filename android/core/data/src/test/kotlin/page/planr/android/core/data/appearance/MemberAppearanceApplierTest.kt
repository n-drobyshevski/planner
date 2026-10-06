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
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.core.model.AppLocale
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
        /** null: no per-app language (below API 33). */
        var appTags: List<String>? = emptyList()
        var systemTags = listOf("en-GB")
        val localesSet = mutableListOf<String>()

        override fun setNightMode(preference: ThemePreference) {
            nightModes += preference
        }

        override fun appLocales(): List<String>? = appTags

        override fun systemLocales(): List<String> = systemTags

        override fun setAppLocale(tag: String) {
            localesSet += tag
            appTags = listOf(tag)
        }
    }

    private val platform = FakePlatform()
    private val member = MutableStateFlow<Member?>(null)

    private var widgetRefreshes = 0

    private fun me(
        theme: ThemePreference = ThemePreference.System,
        locale: AppLocale = AppLocale.En,
        name: String = "Anna",
    ) = Member(id = "m1", workspaceId = "ws", name = name, color = "#c2410c", locale = locale, themePreference = theme)

    /** One DataStore per file per process (DataStore enforces it), so one per test. */
    private fun TestScope.store() = ThemeModeStore(
        PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { File(dir, "appearance_test.preferences_pb") }),
        backgroundScope,
    )

    private fun TestScope.applier(store: ThemeModeStore) =
        MemberAppearanceApplier(
            currentMember = { member },
            themeMode = store,
            platform = platform,
            widgets = WidgetRefreshDispatcher(
                {
                    setOf(
                        object : WidgetRefresher {
                            override suspend fun refreshWidgets() {
                                widgetRefreshes++
                            }
                        },
                    )
                },
                backgroundScope,
            ),
            scope = backgroundScope,
        ).also { it.start() }

    @Test
    fun `signed out, nothing is applied`() = runTest {
        applier(store())
        runCurrent()

        assertEquals(emptyList(), platform.nightModes)
        assertEquals(emptyList(), platform.localesSet)
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

    @Test
    fun `the member's language is set when the app shows another`() = runTest {
        platform.systemTags = listOf("en-GB", "ru-RU")
        applier(store())
        runCurrent() // the widget dispatcher subscribes to its requests
        member.value = me(locale = AppLocale.Ru)
        runCurrent()

        assertEquals(listOf("ru-RU"), platform.localesSet)
        // The widgets are redrawn in it (after the dispatcher's debounce).
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(1, widgetRefreshes)

        member.value = me(locale = AppLocale.En)
        runCurrent()

        assertEquals(listOf("ru-RU", "en-GB"), platform.localesSet)
    }

    @Test
    fun `a language the app already shows is not set again`() = runTest {
        applier(store())
        // The system is English and so is the member: keep following the system.
        member.value = me(locale = AppLocale.En)
        runCurrent()
        member.value = me(locale = AppLocale.En, theme = ThemePreference.Dark)
        runCurrent()

        assertEquals(emptyList(), platform.localesSet)
        assertEquals(0, widgetRefreshes)
    }

    @Test
    fun `without per-app languages the system language stays`() = runTest {
        platform.appTags = null
        applier(store())
        member.value = me(locale = AppLocale.Ru)
        runCurrent()

        assertEquals(emptyList(), platform.localesSet)
    }
}
