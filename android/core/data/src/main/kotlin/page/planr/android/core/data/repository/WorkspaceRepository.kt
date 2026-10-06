package page.planr.android.core.data.repository

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.local.CacheArea
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.local.RefreshCoalescer
import page.planr.android.core.data.local.dao.WorkspaceDao
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.model.MemberPreferencesPatch
import page.planr.android.core.data.remote.MemberMutations
import page.planr.android.core.data.remote.WorkspaceQueries
import page.planr.android.core.data.sync.WidgetRefreshDispatcher
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member

/** Members, categories and boards of the signed-in workspace (Room-backed). */
@Singleton
class WorkspaceRepository @Inject constructor(
    private val session: SessionManager,
    private val queries: WorkspaceQueries,
    private val members: MemberMutations,
    private val dao: WorkspaceDao,
    private val gate: CacheGate,
    private val widgets: WidgetRefreshDispatcher,
    private val coalescer: RefreshCoalescer = RefreshCoalescer(gate, Clock.System),
) {

    /** Both members, oldest first (Member A, then Member B). */
    fun observeMembers(): Flow<List<Member>> =
        session.inWorkspace(emptyList()) { ws -> dao.observeMembers(ws).map { rows -> rows.map { it.toModel() } } }

    /** The signed-in member's own row. */
    fun observeCurrentMember(): Flow<Member?> =
        observeMembers().map { members -> members.firstOrNull { it.id == session.currentSession?.memberId } }

    fun observeCategories(): Flow<List<Category>> =
        session.inWorkspace(emptyList()) { ws -> dao.observeCategories(ws).map { rows -> rows.map { it.toModel() } } }

    fun observeBoards(): Flow<List<Board>> =
        session.inWorkspace(emptyList()) { ws -> dao.observeBoards(ws).map { rows -> rows.map { it.toModel() } } }

    /**
     * Writes the signed-in member's own preferences (time zones, success
     * notifications) and caches the stored row, so every screen reading the
     * member (the agenda's zone, the notices) follows at once. The widgets
     * redraw too: they render in the member's zone.
     */
    suspend fun updateMemberPreferences(patch: MemberPreferencesPatch) {
        if (patch.isEmpty) return
        val me = session.requireSession()
        val ticket = gate.ticket()
        val stored = members.updatePreferences(me.memberId, patch)
        gate.change(ticket, CacheArea.Workspace) { dao.upsertMembers(listOf(stored.toEntity())) }
        widgets.requestRefresh()
    }

    /**
     * Refetches the bundle (`fetchWorkspaceBundle`) and replaces the cached
     * copy. Joins a refresh already running and skips one done moments ago
     * unless [force]d ([RefreshCoalescer]).
     */
    suspend fun refresh(force: Boolean = false) {
        val ws = session.requireSession().workspaceId
        coalescer.refresh(ws, force) {
            gate.refresh(CacheArea.Workspace, fetch = { queries.fetchWorkspaceBundle() }) { bundle ->
                dao.replaceAll(
                    workspaceId = ws,
                    members = bundle.members.map { it.toEntity() },
                    categories = bundle.categories.map { it.toEntity() },
                    boards = bundle.boards.map { it.toEntity() },
                )
            }
            true
        }
    }
}
