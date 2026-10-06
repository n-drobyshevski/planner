package page.planr.android.core.data.health

import javax.inject.Inject
import kotlinx.coroutines.flow.first
import page.planr.android.core.data.repository.WorkspaceRepository

/**
 * The member's profile zone (`members.timezone`, the id as stored), which the
 * check-in card and the Sleep tab date nights in ([page.planr.android.core.model.viewerTimeZone]).
 * Null when unset or not cached yet. Behind an interface so sync is testable.
 */
fun interface MemberZone {
    suspend fun of(memberId: String): String?
}

/** From the members cached in Room. */
class CachedMemberZone @Inject constructor(
    private val workspace: WorkspaceRepository,
) : MemberZone {
    override suspend fun of(memberId: String): String? =
        workspace.observeMembers().first().firstOrNull { it.id == memberId }?.timezone
}
