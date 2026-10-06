package page.planr.android.core.data.repository

import javax.inject.Inject
import javax.inject.Singleton
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.model.SleepPrefsPatch
import page.planr.android.core.data.remote.SleepRemote

/**
 * The signed-in member's calendar-facing sleep settings (`member_sleep_prefs`).
 * Member-private and not cached: the Health Connect sync reads them fresh
 * on every run, so a save here applies to its next night.
 */
@Singleton
class SleepPrefsRepository @Inject constructor(
    private val session: SessionManager,
    private val remote: SleepRemote,
) {
    suspend fun fetch(): SleepBlockPrefs = remote.fetchBlockPrefs(session.requireSession().memberId)

    /** Writes only the set fields of [patch]; returns the settings as stored. */
    suspend fun save(patch: SleepPrefsPatch): SleepBlockPrefs {
        val me = session.requireSession()
        return remote.saveBlockPrefs(me.workspaceId, me.memberId, patch)
    }
}
