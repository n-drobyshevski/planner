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
 * Subscribe to all event/override/category/task changes for a workspace.
 * RLS is enforced for realtime, so a private event/task of the other member is
 * never delivered here. The handler receives the row-change payload so callers
 * can filter by table and narrow invalidation. Returns an unsubscribe function.
 */
export function subscribeWorkspace(
  sb: SupabaseClient,
  workspaceId: string,
  onChange: (change: WorkspaceChange) => void,
  channelKey = "main",
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
      { event: "*", schema: "public", table: "boards", filter },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter },
      onChange,
    )
    .subscribe();

  return () => {
    void sb.removeChannel(channel);
  };
}
