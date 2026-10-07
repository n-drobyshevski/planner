package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.json.JsonObject
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
 *
 * Unlike the web, the events and tasks reads page past PostgREST's
 * `max_rows` (see [selectAllPages]), so a large workspace is never cached
 * truncated.
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
     * raw — expansion is client-side) plus their overrides, every page of
     * both.
     *
     * The server keeps every series (`mayIntersect` checks
     * `recurrence_ends_at` client-side) and the one-offs that end at or after
     * the window start; together with the post-filter that is exactly the
     * set the unbounded query returned, minus the transfer. Overrides are
     * fetched in id chunks, a few chunks at a time; [includeOverrides] false
     * skips them (a lookup that only needs the rows).
     */
    suspend fun fetchWindow(
        workspaceId: String,
        window: TimeWindow,
        includeOverrides: Boolean = true,
    ): WindowData = coroutineScope {
        val events = selectAllPages(
            SupabaseTables.EVENTS,
            filters = listOf(
                eq("workspace_id", workspaceId),
                lt("starts_at", PostgresTime.toIso(window.end)),
                anyOf(isNotNull("rrule"), gte("ends_at", PostgresTime.toIso(window.start))),
            ),
        ).decodeAll(PlannerEvent.serializer()).filter { it.mayIntersect(window) }
        if (events.isEmpty() || !includeOverrides) return@coroutineScope WindowData(events, emptyList())

        val limiter = Semaphore(OVERRIDE_CONCURRENCY)
        val overrides = events.map { it.id }.chunked(OVERRIDE_ID_CHUNK)
            .map { ids ->
                async {
                    limiter.withPermit { selectAllPages(SupabaseTables.EVENT_OVERRIDES, listOf(isIn("event_id", ids))) }
                }
            }
            .awaitAll()
            .flatten() // chunk order, however the requests interleaved
        WindowData(events, overrides.decodeAll(EventOverride.serializer()))
    }

    /**
     * `fetchTasks`: every task in the workspace (not windowed), all pages.
     * Completed tasks are never deleted, so a workspace can pass `max_rows`,
     * and the snapshot replaces the cached set: a truncated one would delete
     * the rest locally.
     */
    suspend fun fetchTasks(workspaceId: String): List<Task> =
        selectAllPages(SupabaseTables.TASKS, filters = listOf(eq("workspace_id", workspaceId)))
            .decodeAll(Task.serializer())
            .sortedWith(compareBy<Task>({ it.position }, { it.createdAt })) // the web's ORDER BY

    /**
     * [ownerId]'s events carrying one of [uids] as `attributes.icalUid` (an
     * .ics import's duplicate lookup, `fetchImportDuplicates` on the web), in
     * IN lists of [ICAL_UID_CHUNK], every page. UIDs holding `"` or `\`
     * are skipped, as on the web; those still match on title and time.
     */
    suspend fun fetchEventsByIcalUid(workspaceId: String, ownerId: String, uids: Collection<String>): List<PlannerEvent> =
        uids.distinct()
            .filter { it.isNotEmpty() && '"' !in it && '\\' !in it }
            .chunked(ICAL_UID_CHUNK)
            .flatMap { chunk ->
                selectAllPages(
                    SupabaseTables.EVENTS,
                    filters = listOf(
                        eq("workspace_id", workspaceId),
                        eq("owner_id", ownerId),
                        isInQuoted(ICAL_UID_COLUMN, chunk),
                    ),
                )
            }
            .decodeAll(PlannerEvent.serializer())
            .distinctBy { it.id }

    /** One event row, e.g. to reload it after a stale write; null when gone or hidden. */
    suspend fun fetchEvent(workspaceId: String, id: String): PlannerEvent? = gateway.select(
        SupabaseTables.EVENTS,
        filters = listOf(eq("workspace_id", workspaceId), eq("id", id)),
    ).firstOrNull()?.decodeAs(PlannerEvent.serializer())

    /** Every override of the series [eventId], all pages; none when it is gone or hidden. */
    suspend fun fetchOverrides(workspaceId: String, eventId: String): List<EventOverride> =
        selectAllPages(SupabaseTables.EVENT_OVERRIDES, filters = listOf(eq("workspace_id", workspaceId), eq("event_id", eventId)))
            .decodeAll(EventOverride.serializer())

    /** One task row; null when gone or hidden. */
    suspend fun fetchTask(workspaceId: String, id: String): Task? = gateway.select(
        SupabaseTables.TASKS,
        filters = listOf(eq("workspace_id", workspaceId), eq("id", id)),
    ).firstOrNull()?.decodeAs(Task.serializer())

    /**
     * The calendar blocks linked to [taskId] (`fetchTaskBlocks` narrowed to
     * one task), every page, by start. Un-windowed: a task's blocks are few,
     * and the detail lists past ones too.
     */
    suspend fun fetchTaskBlocks(workspaceId: String, taskId: String): List<PlannerEvent> =
        selectAllPages(SupabaseTables.EVENTS, filters = listOf(eq("workspace_id", workspaceId), eq("task_id", taskId)))
            .decodeAll(PlannerEvent.serializer())
            .sortedBy { it.start }

    /**
     * Whether any calendar block (an event with `task_id`) is linked to one of
     * [taskIds], in IN lists of [OVERRIDE_ID_CHUNK]. Asked of the server, not
     * the cache, which only holds the windows the agenda has shown.
     */
    suspend fun hasEventsOfTasks(workspaceId: String, taskIds: Collection<String>): Boolean =
        taskIds.distinct().chunked(OVERRIDE_ID_CHUNK).any { chunk ->
            gateway.select(
                SupabaseTables.EVENTS,
                columns = "id",
                filters = listOf(eq("workspace_id", workspaceId), isIn("task_id", chunk)),
                limit = 1,
            ).isNotEmpty()
        }

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

    /**
     * Every row matching [filters], by keyset pagination on the primary key:
     * `order=id.asc`, then `id=gt.<last id>` on each following page, with an
     * exact count on every page. The count includes the cursor filter, so it
     * is the number of rows still ahead of it.
     *
     * A short page alone never means "done": a server whose `max_rows` is
     * below [PAGE_SIZE] returns short pages too. The loop stops on an empty
     * page or one that held every remaining row. Rows inserted behind the
     * cursor meanwhile are missed, as with any keyset scan; Realtime
     * delivers them. Past [MAX_PAGES] it throws rather than truncate.
     */
    private suspend fun selectAllPages(table: String, filters: List<RowFilter>): List<JsonObject> {
        val out = ArrayList<JsonObject>()
        var after: String? = null
        repeat(MAX_PAGES) {
            val page = gateway.selectPage(
                table,
                filters = filters + listOfNotNull(after?.let { gt("id", it) }),
                order = listOf(RowOrder("id")),
                limit = PAGE_SIZE,
            )
            out += page.rows
            if (page.rows.isEmpty()) return out
            val remaining = page.total ?: error("$table: PostgREST sent no count")
            if (page.rows.size.toLong() >= remaining) return out
            after = page.rows.last().string("id") ?: error("$table row without id")
        }
        error("$table: more than $MAX_PAGES pages for one fetch")
    }

    companion object {
        const val PAGE_SIZE = 500L

        /** ≥ 100k rows even at a 250-row `max_rows`: a hard failure beats a silently truncated cache. */
        const val MAX_PAGES = 400

        /** 120 uuids (36 chars + ',') ≈ 4.5 KB of query string; well under proxy/URL limits. */
        const val OVERRIDE_ID_CHUNK = 120

        /** UIDs per IN list of [fetchEventsByIcalUid] (they can be long: Outlook's are 40+ characters). */
        const val ICAL_UID_CHUNK = 100

        /** Where an imported event keeps its iCalendar UID (`attributes->>icalUid`). */
        const val ICAL_UID_COLUMN = "attributes->>icalUid"

        /** Override chunks in flight at once. All inside the `CacheGate` fetch, so atomicity is unchanged. */
        const val OVERRIDE_CONCURRENCY = 4

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
