import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Subscribe to all event/override/category/task changes for a workspace.
 * RLS is enforced for realtime, so a private event/task of the other member is
 * never delivered here. Returns an unsubscribe function.
 */
export function subscribeWorkspace(
  sb: SupabaseClient,
  workspaceId: string,
  onChange: () => void,
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
      { event: "*", schema: "public", table: "tasks", filter },
      onChange,
    )
    .subscribe();

  return () => {
    void sb.removeChannel(channel);
  };
}
