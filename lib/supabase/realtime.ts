import type {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";

/**
 * One realtime row change. `table` lets a subscriber react only to the tables
 * it owns, and `new`/`old` let it scope invalidation to the affected rows.
 * Note: with the default replica identity, `old` only carries the primary key
 * on UPDATE/DELETE — full row data is available on INSERT (`new`) only.
 */
export type WorkspaceChange = RealtimePostgresChangesPayload<
  Record<string, unknown>
>;

/**
 * Channel lifecycle, simplified to what subscribers act on. "subscribed" with
 * `wasReconnect` means payloads may have been missed while the channel was
 * down — refetch to reconcile. "error" covers CHANNEL_ERROR and TIMED_OUT.
 */
export type ChannelStatus = "subscribed" | "error" | "closed";

/**
 * Subscribe to all event/override/category/task/task-status-event/sleep-log/
 * goal/insights-pref changes for a workspace. RLS is enforced for realtime, so a private
 * event/task — or any sleep log, saved view or prefs row of the other member —
 * is never delivered here. The handler receives the row-change payload so callers
 * can filter by table and narrow invalidation. Returns an unsubscribe function.
 *
 * `onStatus` surfaces channel health: the realtime client auto-reconnects, and
 * without it a dead channel would just mean silently stale data.
 */
export function subscribeWorkspace(
  sb: SupabaseClient,
  workspaceId: string,
  onChange: (change: WorkspaceChange) => void,
  channelKey = "main",
  opts?: { onStatus?: (status: ChannelStatus, wasReconnect: boolean) => void },
): () => void {
  const filter = `workspace_id=eq.${workspaceId}`;
  const channel = sb
    .channel(`workspace:${workspaceId}:${channelKey}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "event_overrides", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "categories", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "collections", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "boards", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_status_events", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sleep_logs", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "category_goals", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "insights_views", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "insights_prefs", filter },
      onChange,
    );

  // Track whether this channel has been live before, so a re-SUBSCRIBED after
  // a drop is distinguishable from the initial join.
  let hadSession = false;
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      opts?.onStatus?.("subscribed", hadSession);
      hadSession = true;
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      opts?.onStatus?.("error", hadSession);
    } else if (status === "CLOSED") {
      opts?.onStatus?.("closed", hadSession);
    }
  });

  return () => {
    void sb.removeChannel(channel);
  };
}
