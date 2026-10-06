package page.planr.android.core.data.appearance

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
import page.planr.android.core.model.Member
import page.planr.android.core.model.ThemePreference

/**
 * Applies the signed-in member's `theme_preference` (set on the web, synced
 * with their row) to the app. Signed out, the last applied appearance stays.
 */
@Singleton
class MemberAppearanceApplier internal constructor(
    private val currentMember: () -> Flow<Member?>,
    private val themeMode: ThemeModeStore,
    private val platform: AppearancePlatform,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(
        workspace: WorkspaceRepository,
        themeMode: ThemeModeStore,
        platform: AppearancePlatform,
        @ApplicationScope scope: CoroutineScope,
    ) : this(workspace::observeCurrentMember, themeMode, platform, scope)

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
    }

    private suspend fun applyTheme(preference: ThemePreference) {
        if (!AppearanceRules.shouldApplyTheme(themeMode.lastApplied(), preference)) return
        // The cache first: before API 31 it is what the open screens redraw from.
        themeMode.save(preference)
        platform.setNightMode(preference)
    }
}
