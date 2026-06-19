import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EventRow,
  OverrideRow,
  Member,
  Category,
  CategoryGoal,
  InsightsPrefs,
  InsightsView,
  Collection,
  Board,
  SleepLog,
  MemberSleepPrefs,
  TaskRow,
  TaskStatusEvent,
  TaskCheckpoint,
  TaskDependency,
  TimeWindow,
  TimeslotRequestRow,
  PublicShareRow,
} from "@/lib/types";
import {
  mapEvent,
  mapOverride,
  mapTimeslotRequest,
  mapPublicShare,
  mapMember,
  mapCategory,
  mapCategoryGoal,
  mapInsightsPrefs,
  mapInsightsView,
  mapCollection,
  mapBoard,
  mapSleepLog,
  mapMemberSleepPrefs,
  mapTask,
  mapStatusEvent,
  mapCheckpoint,
  mapTaskDependency,
} from "./mappers";

export interface WorkspaceBundle {
  workspaceId: string;
  workspaceName: string;
  members: Member[];
  categories: Category[];
  collections: Collection[];
  boards: Board[];
  /** The signed-in member's OWN sleep prefs (member-private RLS); null = none yet. */
  sleepPrefs: MemberSleepPrefs | null;
}

/** Load the (single) workspace the signed-in member belongs to. RLS scopes it. */
export async function fetchWorkspaceBundle(
  sb: SupabaseClient,
): Promise<WorkspaceBundle> {
  const [wsRes, memRes, catRes, collRes, boardRes, sleepPrefsRes] = await Promise.all([
    sb.from("workspaces").select("*").limit(1).single(),
    sb.from("members").select("*").order("created_at"),
    sb.from("categories").select("*").order("sort_order"),
    sb.from("collections").select("*").order("sort_order"),
    sb.from("boards").select("*").order("position"),
    // Member-private RLS returns only the signed-in member's own row.
    sb.from("member_sleep_prefs").select("*").maybeSingle(),
  ]);
  if (wsRes.error) throw wsRes.error;
  if (memRes.error) throw memRes.error;
  if (catRes.error) throw catRes.error;
  if (collRes.error) throw collRes.error;
  if (boardRes.error) throw boardRes.error;
  if (sleepPrefsRes.error) throw sleepPrefsRes.error;

  return {
    workspaceId: wsRes.data.id as string,
    workspaceName: wsRes.data.name as string,
    members: (memRes.data ?? []).map(mapMember),
    categories: (catRes.data ?? []).map(mapCategory),
    collections: (collRes.data ?? []).map(mapCollection),
    boards: (boardRes.data ?? []).map(mapBoard),
    sleepPrefs: sleepPrefsRes.data ? mapMemberSleepPrefs(sleepPrefsRes.data) : null,
  };
}

export interface WindowData {
  events: EventRow[];
  overrides: OverrideRow[];
}

/**
 * True iff a cached value is a window's `{ events, overrides }` payload.
 *
 * `qk.taskBlocks` is deliberately keyed UNDER the `["events", workspaceId]`
 * prefix (see query-keys.ts) so `eventsAll` invalidation refetches it — but its
 * data is a bare `EventRow[]`, not a `WindowData`. Optimistic cache patches run
 * via `setQueriesData({ queryKey: eventsAll })`, which matches that array too,
 * so every window updater MUST guard with this before touching `.events` /
 * `.overrides`, or it throws on the task-blocks entry.
 */
export function isWindowData(value: unknown): value is WindowData {
  return (
    value != null &&
    typeof value === "object" &&
    Array.isArray((value as Partial<WindowData>).events) &&
    Array.isArray((value as Partial<WindowData>).overrides)
  );
}

/**
 * Events (+ their overrides) that could intersect a visible window.
 * Recurring series are returned raw; occurrence expansion happens client-side
 * via lib/recurrence/expand. RLS enforces scope/visibility.
 */
export async function fetchWindow(
  sb: SupabaseClient,
  workspaceId: string,
  win: TimeWindow,
): Promise<WindowData> {
  const winEndIso = new Date(win.end).toISOString();

  const { data, error } = await sb
    .from("events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .lt("starts_at", winEndIso)
    .order("starts_at");
  if (error) throw error;

  const all = (data ?? []).map(mapEvent);
  const events = all.filter((e) =>
    e.rrule
      ? e.recurrenceEndsAt == null || e.recurrenceEndsAt >= win.start
      : e.end >= win.start,
  );

  if (events.length === 0) return { events, overrides: [] };

  const ids = events.map((e) => e.id);
  const { data: ovData, error: ovErr } = await sb
    .from("event_overrides")
    .select("*")
    .in("event_id", ids);
  if (ovErr) throw ovErr;

  return { events, overrides: (ovData ?? []).map(mapOverride) };
}

/**
 * The PUBLIC (anonymous) read path: events (+ overrides) for a share token over a
 * window. Calls the SECURITY DEFINER RPCs, which validate the token (active) and
 * apply the STRICT server-side public filter + busy-mode redaction in SQL — the
 * anon caller never touches the events table and can never see a private,
 * hidden-from-public, or inactive event. Pass `sb` = the cookieless anon client
 * (lib/supabase/anon). Mirrors `fetchWindow`'s post-filter exactly: the RPC prunes
 * `starts_at < win.end`; we keep the end/recurrence overlap test here. An invalid /
 * expired / revoked token simply yields no rows (an empty calendar), never an error.
 */
/** Non-sensitive metadata for a share link (no calendar data). `null` = the token
 *  doesn't exist; `active=false` = it exists but is revoked/expired. */
export interface PublicShareMeta {
  active: boolean;
  label: string | null;
  mode: "details" | "busy";
}

export async function fetchPublicShareMeta(
  sb: SupabaseClient,
  token: string,
): Promise<PublicShareMeta | null> {
  const { data, error } = await sb.rpc("public_share_meta", { p_token: token });
  if (error) throw error;
  const row = (data ?? [])[0] as
    | { active: boolean; label: string | null; mode: "details" | "busy" }
    | undefined;
  return row
    ? { active: row.active, label: row.label ?? null, mode: row.mode }
    : null;
}

export async function fetchWindowPublic(
  sb: SupabaseClient,
  token: string,
  win: TimeWindow,
): Promise<WindowData> {
  const startIso = new Date(win.start).toISOString();
  const endIso = new Date(win.end).toISOString();
  const params = { p_token: token, p_start: startIso, p_end: endIso };

  const { data, error } = await sb.rpc("public_calendar_events", params);
  if (error) throw error;

  const all = ((data ?? []) as Record<string, unknown>[]).map(mapEvent);
  const events = all.filter((e) =>
    e.rrule
      ? e.recurrenceEndsAt == null || e.recurrenceEndsAt >= win.start
      : e.end >= win.start,
  );
  if (events.length === 0) return { events, overrides: [] };

  const { data: ovData, error: ovErr } = await sb.rpc(
    "public_calendar_overrides",
    params,
  );
  if (ovErr) throw ovErr;

  // The RPC returns overrides for every permitted event in the window; keep only
  // those belonging to the events we actually return (mirrors fetchWindow's `.in`).
  const ids = new Set(events.map((e) => e.id));
  const overrides = ((ovData ?? []) as Record<string, unknown>[])
    .map(mapOverride)
    .filter((o) => ids.has(o.eventId));

  return { events, overrides };
}

/**
 * The viewer's PENDING incoming timeslot requests (Phase 4). RLS returns only the
 * owner's own rows, so this is naturally viewer-scoped. Resolved (approved/declined)
 * rows are excluded — the inbox shows only what still needs a decision.
 */
export async function fetchTimeslotRequests(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<TimeslotRequestRow[]> {
  const { data, error } = await sb
    .from("timeslot_requests")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTimeslotRequest);
}

/**
 * The owner's public share links (Phase 4), newest first. RLS scopes to the owner;
 * the settings UI lists, creates, and revokes them.
 */
export async function fetchPublicShares(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<PublicShareRow[]> {
  const { data, error } = await sb
    .from("public_calendar_shares")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPublicShare);
}

/**
 * All tasks (top-level + subtasks) in the workspace, ordered by position.
 * The board/list need the full set, so this is not windowed. RLS enforces
 * scope/visibility, exactly like events.
 */
export async function fetchTasks(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<TaskRow[]> {
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

/**
 * Every task-linked calendar block in the workspace (events with a non-null
 * task_id), for the Flows view's scheduled-block markers. Un-windowed like
 * fetchTasks — task blocks are non-recurring and few, so the whole set is one
 * cache entry. RLS only returns blocks the viewer can see (a partner's private
 * blocks never come back).
 */
export async function fetchTaskBlocks(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<EventRow[]> {
  const { data, error } = await sb
    .from("events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .not("task_id", "is", null)
    .order("starts_at");
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

/**
 * The full status-change history for the workspace, oldest first. Append-only
 * and tiny (a handful of rows per task), so it's a single un-windowed cache
 * entry like fetchTasks. RLS only returns events for tasks the viewer can see.
 */
export async function fetchTaskStatusEvents(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<TaskStatusEvent[]> {
  const { data, error } = await sb
    .from("task_status_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("changed_at");
  if (error) throw error;
  return (data ?? []).map(mapStatusEvent);
}

/**
 * All flow checkpoints for the workspace, ordered by date then position. Tiny
 * and un-windowed like the status history; RLS only returns checkpoints for
 * tasks the viewer can see (a private task's checkpoints never come back).
 */
export async function fetchTaskCheckpoints(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<TaskCheckpoint[]> {
  const { data, error } = await sb
    .from("task_checkpoints")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("at_date")
    .order("position");
  if (error) throw error;
  return (data ?? []).map(mapCheckpoint);
}

/**
 * Every blocks/blocked-by dependency edge in the workspace. Tiny and un-windowed
 * like the checkpoints/status history; RLS only returns edges where both
 * endpoints are visible to the viewer.
 */
export async function fetchTaskDependencies(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<TaskDependency[]> {
  const { data, error } = await sb
    .from("task_dependencies")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapTaskDependency);
}

/**
 * All of the viewer's sleep logs, oldest first. Not windowed: one tiny row
 * per night means the whole history stays a single shared cache entry for the
 * check-in card, Tonight card, history chart, and backfill dialog. RLS is
 * member-private — the partner's rows are never returned; the eq filters are
 * belt-and-braces like fetchTasks.
 */
/** All per-category weekly goals of the workspace (workspace-shared). */
export async function fetchCategoryGoals(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<CategoryGoal[]> {
  const { data, error } = await sb
    .from("category_goals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapCategoryGoal);
}

/** The viewer's saved Insights views (member-private under RLS). */
export async function fetchInsightsViews(
  sb: SupabaseClient,
  workspaceId: string,
  memberId: string,
): Promise<InsightsView[]> {
  const { data, error } = await sb
    .from("insights_views")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("member_id", memberId)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapInsightsView);
}

/** The viewer's Insights prefs row, or null before first customization. */
export async function fetchInsightsPrefs(
  sb: SupabaseClient,
  workspaceId: string,
  memberId: string,
): Promise<InsightsPrefs | null> {
  const { data, error } = await sb
    .from("insights_prefs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInsightsPrefs(data) : null;
}

export async function fetchSleepLogs(
  sb: SupabaseClient,
  workspaceId: string,
  memberId: string,
): Promise<SleepLog[]> {
  const { data, error } = await sb
    .from("sleep_logs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("member_id", memberId)
    .order("date");
  if (error) throw error;
  return (data ?? []).map(mapSleepLog);
}
