import type {
  RealtimeChannel,
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
 * Deletes never match the `workspace_id` filter (the old record carries only
 * the primary key), and a row turning private simply stops arriving. Both come
 * instead as `row_gone` broadcasts on the workspace's private sync topic (see
 * `joinSyncChannel`), handed to `onChange` as the same DELETE-shaped payload.
 *
 * `onStatus` surfaces channel health: the realtime client auto-reconnects, and
 * without it a dead channel would just mean silently stale data. A rejoin of
 * the sync channel is reported as a reconnect too: deletes may have been missed.
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
      { event: "*", schema: "public", table: "task_checkpoints", filter },
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

  const leaveSync = joinSyncChannel(sb, workspaceId, {
    onChange,
    onReconnect: () => opts?.onStatus?.("subscribed", true),
  });

  return () => {
    leaveSync();
    void sb.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Deletes over the private sync topic
// ---------------------------------------------------------------------------

/** The broadcast event the server's row_gone triggers send. */
export const ROW_GONE_EVENT = "row_gone";

/**
 * The private topic the row_gone triggers send to; the policy on
 * realtime.messages admits only this workspace's members, and no client can
 * send to it (migration 20261009000000_broadcast_deletes_and_editor).
 */
export function syncTopic(workspaceId: string): string {
  return `workspace:${workspaceId}:sync`;
}

/**
 * A row that left the workspace's view: deleted, or turned private ("hidden")
 * so only its owner sees it now. `title` / `startsAt` / `endsAt` describe what
 * went (for a partner-change notice): only an events/tasks delete of a row
 * that was not private carries them (the times for events only).
 */
export interface RowGone {
  table: string;
  id: string;
  kind: "delete" | "hidden";
  /** the row's owner; null for shared rows and tables without one */
  ownerId: string | null;
  /** the member whose write removed it; null for a service or cron write */
  actor: string | null;
  title: string | null;
  startsAt: number | null;
  endsAt: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const ms = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

/**
 * Read a row_gone broadcast: the client hands over `{ type, event, payload }`,
 * so the fields sit under `payload` (a bare payload is accepted too). Null when
 * malformed or of an unknown kind.
 */
export function parseRowGone(message: unknown): RowGone | null {
  if (!message || typeof message !== "object") return null;
  const outer = message as Record<string, unknown>;
  const inner = outer.payload;
  const p =
    !("table" in outer) && inner && typeof inner === "object"
      ? (inner as Record<string, unknown>)
      : outer;
  const table = str(p.table);
  const id = str(p.id);
  const kind = p.kind;
  if (!table || !id || (kind !== "delete" && kind !== "hidden")) return null;
  return {
    table,
    id,
    kind,
    ownerId: str(p.owner_id),
    actor: str(p.actor),
    title: str(p.title),
    startsAt: ms(p.starts_at),
    endsAt: ms(p.ends_at),
  };
}

/**
 * Whether the viewer `memberId` should drop the row: a delete always; a row
 * turned private unless it is the viewer's own. An unknown viewer drops it
 * too — their own row comes back on the next refetch, the partner's private
 * one must not linger.
 */
export function rowGoneRemoves(gone: RowGone, memberId: string | null): boolean {
  if (gone.kind === "delete") return true;
  return memberId === null || gone.ownerId !== memberId;
}

/**
 * The key on a row_gone DELETE's `old` that says why the row went. A real
 * Postgres Changes payload never carries it (no table has such a column).
 */
export const ROW_GONE_KIND = "_row_gone";

/**
 * The row_gone as the DELETE payload the subscribers already handle (`old`
 * carries the id, exactly like a Postgres Changes DELETE, plus
 * [ROW_GONE_KIND], so a subscriber can tell a row turned private from one
 * deleted: see `isHiddenChange`).
 */
export function rowGoneToChange(gone: RowGone): WorkspaceChange {
  return {
    schema: "public",
    table: gone.table,
    commit_timestamp: new Date().toISOString(),
    errors: [],
    eventType: "DELETE",
    new: {},
    old: { id: gone.id, [ROW_GONE_KIND]: gone.kind },
  };
}

/**
 * Whether `change` is a row that only turned private ("hidden"): the database
 * removed nothing, so a cache drops just that row, not what a delete cascades
 * to (a task's subtasks, its calendar blocks).
 */
export function isHiddenChange(change: WorkspaceChange): boolean {
  if (change.eventType !== "DELETE") return false;
  return (change.old as Record<string, unknown> | undefined)?.[ROW_GONE_KIND] === "hidden";
}

interface SyncListener {
  onChange: (change: WorkspaceChange) => void;
  onReconnect: () => void;
}

interface SyncEntry {
  channel: RealtimeChannel;
  listeners: Set<SyncListener>;
  closed: boolean;
  /** pending removal once the last subscriber left (see SYNC_LINGER_MS) */
  leaveTimer: ReturnType<typeof setTimeout> | null;
  /** the signed-in member, resolved on the first "hidden" broadcast */
  memberId: Promise<string | null> | null;
}

// One sync channel per client and workspace, shared by every subscriber: the
// topic is fixed (the realtime.messages policy matches it exactly), and the
// client hands back the same channel object for the same topic.
const syncChannels = new WeakMap<SupabaseClient, Map<string, SyncEntry>>();

/**
 * How long the sync channel outlives its last subscriber. A remount (route
 * change, Strict Mode) leaves and rejoins in one commit; removing the channel
 * at once would hand the rejoin the same, still-leaving channel object.
 */
export const SYNC_LINGER_MS = 1_000;

/** The member this session belongs to (null when it can't be told). */
async function resolveMemberId(sb: SupabaseClient): Promise<string | null> {
  const { data: claims } = await sb.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data } = await sb.from("members").select("id").eq("auth_user_id", userId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function memberIdOf(sb: SupabaseClient, entry: SyncEntry): Promise<string | null> {
  if (!entry.memberId) {
    entry.memberId = resolveMemberId(sb).catch(() => null);
    // Not knowing is not cached: ask again on the next hidden row.
    void entry.memberId.then((id) => {
      if (id === null) entry.memberId = null;
    });
  }
  return entry.memberId;
}

/**
 * Join the workspace's private sync channel (shared, ref-counted) and route
 * each row_gone to `listener.onChange` as a DELETE. Returns the leave function;
 * the last one out removes the channel.
 */
function joinSyncChannel(
  sb: SupabaseClient,
  workspaceId: string,
  listener: SyncListener,
): () => void {
  let byWorkspace = syncChannels.get(sb);
  if (!byWorkspace) {
    byWorkspace = new Map();
    syncChannels.set(sb, byWorkspace);
  }
  let entry = byWorkspace.get(workspaceId);
  if (!entry) {
    const channel = sb.channel(syncTopic(workspaceId), { config: { private: true } });
    const created: SyncEntry = {
      channel,
      listeners: new Set(),
      closed: false,
      leaveTimer: null,
      memberId: null,
    };
    const dispatch = (gone: RowGone) => {
      const change = rowGoneToChange(gone);
      for (const l of created.listeners) l.onChange(change);
    };
    channel.on("broadcast", { event: ROW_GONE_EVENT }, (message) => {
      const gone = parseRowGone(message);
      if (!gone) return;
      if (gone.kind === "delete") return dispatch(gone);
      void memberIdOf(sb, created).then((memberId) => {
        if (!created.closed && rowGoneRemoves(gone, memberId)) dispatch(gone);
      });
    });
    // A first join that comes only after failed attempts is a reconnect too:
    // deletes sent meanwhile were missed (the main channel was likely live).
    let mayHaveMissed = false;
    let warned = false;
    // A private channel joins with the session's token: make sure the socket
    // holds it first (the client also refreshes it on its own afterwards).
    void sb.realtime
      .setAuth()
      .catch(() => undefined)
      .then(() => {
        if (created.closed) return;
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (mayHaveMissed) for (const l of created.listeners) l.onReconnect();
            mayHaveMissed = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            mayHaveMissed = true;
            if (!warned) {
              warned = true;
              console.warn("[planner] Sync realtime channel error; deletes may show late until it reconnects.");
            }
          }
        });
      });
    entry = created;
    byWorkspace.set(workspaceId, entry);
  }

  const joined = entry;
  if (joined.leaveTimer) {
    clearTimeout(joined.leaveTimer);
    joined.leaveTimer = null;
  }
  joined.listeners.add(listener);
  let left = false;
  return () => {
    if (left) return;
    left = true;
    joined.listeners.delete(listener);
    if (joined.listeners.size > 0 || joined.closed || joined.leaveTimer) return;
    joined.leaveTimer = setTimeout(() => {
      joined.leaveTimer = null;
      if (joined.listeners.size > 0) return;
      joined.closed = true;
      if (byWorkspace.get(workspaceId) === joined) byWorkspace.delete(workspaceId);
      void sb.removeChannel(joined.channel);
    }, SYNC_LINGER_MS);
  };
}
