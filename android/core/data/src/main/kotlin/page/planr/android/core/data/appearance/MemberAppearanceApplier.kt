package page.planr.android.core.data.appearance

import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import page.planr.android.core.data.di.ApplicationScope
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.model.AppLocale
import page.planr.android.core.model.Member
import page.planr.android.core.model.ThemePreference

/**
 * Applies the signed-in member's `theme_preference` and `locale` (set on the
 * web, synced with their row) to the app, as the web reconciles its URL
 * locale to the row. Each is applied only when it differs from what the app
 * already shows, since either recreates every activity. Signed out, the last
 * applied appearance stays.
 */
@Singleton
class MemberAppearanceApplier internal constructor(
    private val currentMember: () -> Flow<Member?>,
    private val themeMode: ThemeModeStore,
    private val platform: AppearancePlatform,
    private val widgets: WidgetRefreshDispatcher,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(
        workspace: WorkspaceRepository,
        themeMode: ThemeModeStore,
        platform: AppearancePlatform,
        widgets: WidgetRefreshDispatcher,
        @ApplicationScope scope: CoroutineScope,
    ) : this(workspace::observeCurrentMember, themeMode, platform, widgets, scope)

    private var started = false

    /** Call once from Application.onCreate (via DataInitializer). */
    fun start() {
        if (started) return
        started = true
        scope.launch {
            currentMember()
                .filterNotNull()
                .map { it.themePreference }
                .distinctUntilChanged()
                .collect { applyTheme(it) }
        }
        scope.launch {
            currentMember()
                .filterNotNull()
                .map { it.locale }
                .distinctUntilChanged()
                .collect { applyLocale(it) }
        }
    }

    private suspend fun applyTheme(preference: ThemePreference) {
        val keeps = platform.keepsNightMode
        if (!AppearanceRules.shouldApplyTheme(themeMode.lastApplied(), preference, keeps, themeMode.lastAppliedOnPlatform())) return
        // The cache first: before API 31 it is what the open screens redraw from.
        try {
            themeMode.save(preference, onPlatform = keeps)
        } catch (_: IOException) {
            // Not remembered, so applied again on the next start; the platform still takes it now.
        }
        platform.setNightMode(preference)
    }

    private fun applyLocale(locale: AppLocale) {
        val appTags = platform.appLocales() ?: return
        val tag = AppearanceRules.localeTagToApply(locale, appTags, platform.systemLocales()) ?: return
        platform.setAppLocale(tag)
        // Widgets are rendered from the app's resources: redraw them in the new language.
        widgets.requestRefresh()
    }
}
