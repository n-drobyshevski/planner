import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EventRow,
  OverrideRow,
  Member,
  Category,
  TaskRow,
  TimeWindow,
} from "@/lib/types";
import { mapEvent, mapOverride, mapMember, mapCategory, mapTask } from "./mappers";

export interface WorkspaceBundle {
  workspaceId: string;
  workspaceName: string;
  members: Member[];
  categories: Category[];
}

/** Load the (single) workspace the signed-in member belongs to. RLS scopes it. */
export async function fetchWorkspaceBundle(
  sb: SupabaseClient,
): Promise<WorkspaceBundle> {
  const [wsRes, memRes, catRes] = await Promise.all([
    sb.from("workspaces").select("*").limit(1).single(),
    sb.from("members").select("*").order("created_at"),
    sb.from("categories").select("*").order("sort_order"),
  ]);
  if (wsRes.error) throw wsRes.error;
  if (memRes.error) throw memRes.error;
  if (catRes.error) throw catRes.error;

  return {
    workspaceId: wsRes.data.id as string,
    workspaceName: wsRes.data.name as string,
    members: (memRes.data ?? []).map(mapMember),
    categories: (catRes.data ?? []).map(mapCategory),
  };
}

export interface WindowData {
  events: EventRow[];
  overrides: OverrideRow[];
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
