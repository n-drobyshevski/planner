package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import page.planr.android.core.data.model.WindowData
import page.planr.android.core.data.model.WorkspaceBundle
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Member
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.Task
import page.planr.android.core.model.TimeWindow

/**
 * The read shapes of lib/supabase/queries.ts the app needs: same tables,
 * columns, filters and ordering. RLS scopes every result to what the
 * signed-in member may see.
 */
class WorkspaceQueries @Inject constructor(
    private val gateway: PostgrestGateway,
) {

    /** `fetchWorkspaceBundle` (v1 subset: no collections / sleep prefs). */
    suspend fun fetchWorkspaceBundle(): WorkspaceBundle = coroutineScope {
        val workspace = async {
            gateway.select(SupabaseTables.WORKSPACES, limit = 1).firstOrNull()
                ?: error("No workspace is visible to this member.")
        }
        val members = async {
            gateway.select(
                SupabaseTables.MEMBERS,
                columns = MEMBER_COLUMNS,
                order = listOf(RowOrder("created_at")),
            )
        }
        val categories = async {
            gateway.select(SupabaseTables.CATEGORIES, order = listOf(RowOrder("sort_order")))
        }
        val boards = async {
            gateway.select(SupabaseTables.BOARDS, order = listOf(RowOrder("position")))
        }
        val ws = workspace.await()
        WorkspaceBundle(
            workspaceId = ws.string("id").orEmpty(),
            workspaceName = ws.string("name").orEmpty(),
            members = members.await().decodeAll(Member.serializer()),
            categories = categories.await().decodeAll(Category.serializer()),
            boards = boards.await().decodeAll(Board.serializer()),
        )
    }

    /**
     * `fetchWindow`: events that could intersect [window] (recurring series
     * raw — expansion is client-side) plus their overrides.
     */
    suspend fun fetchWindow(workspaceId: String, window: TimeWindow): WindowData {
        val rows = gateway.select(
            SupabaseTables.EVENTS,
            filters = listOf(
                eq("workspace_id", workspaceId),
                lt("starts_at", PostgresTime.toIso(window.end)),
            ),
            order = listOf(RowOrder("starts_at")),
        )
        val events = rows.decodeAll(PlannerEvent.serializer()).filter { it.mayIntersect(window) }
        if (events.isEmpty()) return WindowData(events, emptyList())

        val overrides = gateway.select(
            SupabaseTables.EVENT_OVERRIDES,
            filters = listOf(isIn("event_id", events.map { it.id })),
        )
        return WindowData(events, overrides.decodeAll(EventOverride.serializer()))
    }

    /** `fetchTasks`: every task in the workspace (not windowed). */
    suspend fun fetchTasks(workspaceId: String): List<Task> = gateway.select(
        SupabaseTables.TASKS,
        filters = listOf(eq("workspace_id", workspaceId)),
        order = listOf(RowOrder("position"), RowOrder("created_at")),
    ).decodeAll(Task.serializer())

    /** One event row, e.g. to reload it after a stale write; null when gone or hidden. */
    suspend fun fetchEvent(workspaceId: String, id: String): PlannerEvent? = gateway.select(
        SupabaseTables.EVENTS,
        filters = listOf(eq("workspace_id", workspaceId), eq("id", id)),
    ).firstOrNull()?.decodeAs(PlannerEvent.serializer())

    /** One task row; null when gone or hidden. */
    suspend fun fetchTask(workspaceId: String, id: String): Task? = gateway.select(
        SupabaseTables.TASKS,
        filters = listOf(eq("workspace_id", workspaceId), eq("id", id)),
    ).firstOrNull()?.decodeAs(Task.serializer())

    /**
     * The member a token belongs to, like `verifyMcpToken` in lib/mcp/auth.ts:
     * the `members` row where `auth_user_id = sub`. Null when there is none.
     */
    suspend fun findMemberByAuthUser(authUserId: String): MemberRef? {
        val rows = gateway.select(
            SupabaseTables.MEMBERS,
            columns = "id, workspace_id",
            filters = listOf(eq("auth_user_id", authUserId)),
        )
        // maybeSingle(): more than one row is an error, not a pick.
        check(rows.size <= 1) { "More than one member is linked to this account." }
        val row = rows.firstOrNull() ?: return null
        return MemberRef(
            memberId = row.string("id") ?: return null,
            workspaceId = row.string("workspace_id") ?: return null,
        )
    }

    companion object {
        /**
         * Explicit member columns (as on the web): members are readable
         * workspace-wide, so never ask for more than the UI renders.
         */
        const val MEMBER_COLUMNS =
            "id, workspace_id, auth_user_id, name, color, has_secret, has_passkey, locale, " +
                "theme_preference, accent, surface_tone, palette, pink_base, timezone, " +
                "secondary_timezone, show_inactive_in_month, show_success_toasts, context_label, created_at"
    }
}

/** A member/workspace pair resolved from an auth user. */
data class MemberRef(val memberId: String, val workspaceId: String)

/**
 * `fetchWindow`'s post-filter: a series overlaps unless its recurrence ended
 * before the window; a single event unless it ended before it.
 */
fun PlannerEvent.mayIntersect(window: TimeWindow): Boolean =
    start < window.end &&
        if (rrule != null) {
            recurrenceEndsAt.let { it == null || it >= window.start }
        } else {
            end >= window.start
        }
