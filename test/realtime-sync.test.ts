import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isHiddenChange,
  parseRowGone,
  rowGoneRemoves,
  rowGoneToChange,
  subscribeWorkspace,
  syncTopic,
  SYNC_LINGER_MS,
  type RowGone,
  type WorkspaceChange,
} from "@/lib/supabase/realtime";
import { applyTaskChange } from "@/lib/tasks/cache";
import type { TaskRow } from "@/lib/types";

const WS = "ws-1";
const ME = "m-me";
const PARTNER = "m-partner";

describe("parseRowGone", () => {
  it("reads the broadcast envelope supabase-js hands over", () => {
    const gone = parseRowGone({
      type: "broadcast",
      event: "row_gone",
      payload: {
        table: "events",
        id: "e1",
        kind: "delete",
        owner_id: PARTNER,
        actor: PARTNER,
        title: "Dinner",
        starts_at: "2026-06-01T17:00:00+00:00",
        ends_at: "2026-06-01T18:30:00+00:00",
      },
    });
    expect(gone).toEqual<RowGone>({
      table: "events",
      id: "e1",
      kind: "delete",
      ownerId: PARTNER,
      actor: PARTNER,
      title: "Dinner",
      startsAt: Date.parse("2026-06-01T17:00:00Z"),
      endsAt: Date.parse("2026-06-01T18:30:00Z"),
    });
  });

  it("accepts a bare payload, with the optional fields null", () => {
    expect(
      parseRowGone({ table: "categories", id: "c1", kind: "delete", owner_id: null, actor: null }),
    ).toEqual<RowGone>({
      table: "categories",
      id: "c1",
      kind: "delete",
      ownerId: null,
      actor: null,
      title: null,
      startsAt: null,
      endsAt: null,
    });
  });

  it("ignores malformed payloads and unknown kinds", () => {
    expect(parseRowGone(null)).toBeNull();
    expect(parseRowGone("row_gone")).toBeNull();
    expect(parseRowGone({ payload: { id: "e1", kind: "delete" } })).toBeNull();
    expect(parseRowGone({ payload: { table: "events", id: "", kind: "delete" } })).toBeNull();
    expect(parseRowGone({ payload: { table: "events", id: "e1", kind: "archived" } })).toBeNull();
    expect(parseRowGone({ payload: { table: "events", id: "e1", kind: "delete", starts_at: "soon" } })?.startsAt).toBeNull();
  });
});

describe("rowGoneRemoves", () => {
  const gone = (kind: RowGone["kind"]): RowGone => ({
    table: "tasks",
    id: "t1",
    kind,
    ownerId: ME,
    actor: ME,
    title: null,
    startsAt: null,
    endsAt: null,
  });

  it("drops a deleted row for everyone", () => {
    expect(rowGoneRemoves(gone("delete"), ME)).toBe(true);
    expect(rowGoneRemoves(gone("delete"), PARTNER)).toBe(true);
  });

  it("keeps a row turned private with its owner only", () => {
    expect(rowGoneRemoves(gone("hidden"), ME)).toBe(false);
    expect(rowGoneRemoves(gone("hidden"), PARTNER)).toBe(true);
    expect(rowGoneRemoves(gone("hidden"), null)).toBe(true);
  });

  it("becomes the DELETE payload the task cache already applies", () => {
    const task = { id: "t1", parentId: null } as TaskRow;
    const sub = { id: "t2", parentId: "t1" } as TaskRow;
    const other = { id: "t3", parentId: null } as TaskRow;

    const change = rowGoneToChange(gone("delete"));

    expect(change).toMatchObject({ eventType: "DELETE", table: "tasks", old: { id: "t1" } });
    expect(isHiddenChange(change)).toBe(false);
    expect(applyTaskChange([task, sub, other], change)).toEqual([other]);
  });

  it("drops only the task itself when it turned private, keeping its subtasks", () => {
    const task = { id: "t1", parentId: null } as TaskRow;
    const sub = { id: "t2", parentId: "t1" } as TaskRow;
    const other = { id: "t3", parentId: null } as TaskRow;

    const change = rowGoneToChange(gone("hidden"));

    expect(change).toMatchObject({ eventType: "DELETE", table: "tasks", old: { id: "t1" } });
    expect(isHiddenChange(change)).toBe(true);
    expect(applyTaskChange([task, sub, other], change)).toEqual([sub, other]);
  });

  it("never reads a plain Postgres Changes payload as hidden", () => {
    const plain = { eventType: "DELETE", table: "tasks", old: { id: "t1" }, new: {} } as unknown as WorkspaceChange;
    const upsert = { eventType: "UPDATE", table: "tasks", old: {}, new: { id: "t1" } } as unknown as WorkspaceChange;
    expect(isHiddenChange(plain)).toBe(false);
    expect(isHiddenChange(upsert)).toBe(false);
  });
});

/**
 * A client double: records channels, their broadcast handlers and status callbacks.
 * With `holdRemovals`, a removal stays pending until `finishRemovals()`, and like
 * the real client, `channel(topic)` hands back the leaving channel until then.
 */
function mockClient(memberId: string | null = ME, { holdRemovals = false } = {}) {
  type Handler = (message: unknown) => void;
  const channels = new Map<
    string,
    {
      opts: unknown;
      broadcast: Handler[];
      onStatus: ((status: string) => void) | null;
      removed: boolean;
    }
  >();
  const membersQuery = vi.fn(async () => ({ data: memberId ? { id: memberId } : null }));
  const pendingRemovals: (() => void)[] = [];
  const sb = {
    channel: vi.fn((topic: string, opts?: unknown) => {
      const record = channels.get(topic) ?? {
        opts,
        broadcast: [] as Handler[],
        onStatus: null as ((status: string) => void) | null,
        removed: false,
      };
      channels.set(topic, record);
      const ch = {
        topic,
        on: (type: string, filter: { event?: string }, handler: Handler) => {
          if (type === "broadcast" && filter.event === "row_gone") record.broadcast.push(handler);
          return ch;
        },
        subscribe: (cb: (status: string) => void) => {
          record.onStatus = cb;
          return ch;
        },
      };
      return ch;
    }),
    removeChannel: vi.fn(async (ch: { topic: string }) => {
      const record = channels.get(ch.topic);
      if (record) record.removed = true;
      if (holdRemovals) {
        // Left the client's list only once the leave is acked.
        await new Promise<void>((resolve) => pendingRemovals.push(resolve));
        channels.delete(ch.topic);
      }
      return "ok";
    }),
    realtime: { setAuth: vi.fn(async () => undefined) },
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "user-1" } } })) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: membersQuery }) }),
    })),
  };
  const send = (message: unknown) => {
    for (const h of channels.get(syncTopic(WS))?.broadcast ?? []) h(message);
  };
  const finishRemovals = () => {
    for (const resolve of pendingRemovals.splice(0)) resolve();
  };
  return { sb: sb as unknown as SupabaseClient, raw: sb, channels, send, membersQuery, finishRemovals };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("subscribeWorkspace — sync channel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("joins the private topic once and routes deletes to every subscriber", async () => {
    const { sb, raw, channels, send } = mockClient();
    const a: WorkspaceChange[] = [];
    const b: WorkspaceChange[] = [];
    const leaveA = subscribeWorkspace(sb, WS, (c) => a.push(c), "main");
    const leaveB = subscribeWorkspace(sb, WS, (c) => b.push(c), "tasks");
    await flush();

    expect(raw.channel.mock.calls.filter(([t]) => t === syncTopic(WS))).toHaveLength(1);
    expect(channels.get(syncTopic(WS))?.opts).toEqual({ config: { private: true } });
    expect(raw.realtime.setAuth).toHaveBeenCalled();

    send({ type: "broadcast", event: "row_gone", payload: { table: "events", id: "e1", kind: "delete", owner_id: PARTNER } });

    expect(a).toMatchObject([{ eventType: "DELETE", table: "events", old: { id: "e1" } }]);
    expect(b).toMatchObject([{ eventType: "DELETE", table: "events", old: { id: "e1" } }]);
    leaveA();
    leaveB();
  });

  it("drops the partner's row turned private, keeps the viewer's own", async () => {
    const { sb, send, membersQuery } = mockClient(ME);
    const seen: WorkspaceChange[] = [];
    const leave = subscribeWorkspace(sb, WS, (c) => seen.push(c));
    await flush();

    send({ payload: { table: "tasks", id: "mine", kind: "hidden", owner_id: ME } });
    send({ payload: { table: "tasks", id: "theirs", kind: "hidden", owner_id: PARTNER } });
    await flush();

    expect(seen.map((c) => (c.old as { id: string }).id)).toEqual(["theirs"]);
    expect(membersQuery).toHaveBeenCalledTimes(1); // the member is resolved once
    leave();
  });

  it("ignores malformed broadcasts", async () => {
    const { sb, send } = mockClient();
    const seen: WorkspaceChange[] = [];
    const leave = subscribeWorkspace(sb, WS, (c) => seen.push(c));
    await flush();

    send({ payload: { table: "events", kind: "delete" } });

    expect(seen).toEqual([]);
    leave();
  });

  it("reports a sync rejoin as a reconnect, but not the first join", async () => {
    const { sb, channels } = mockClient();
    const onStatus = vi.fn();
    const leave = subscribeWorkspace(sb, WS, () => {}, "main", { onStatus });
    await flush();
    const sync = channels.get(syncTopic(WS))!;

    sync.onStatus?.("SUBSCRIBED");
    expect(onStatus).not.toHaveBeenCalled();

    sync.onStatus?.("CHANNEL_ERROR");
    sync.onStatus?.("SUBSCRIBED");
    expect(onStatus).toHaveBeenCalledWith("subscribed", true);
    leave();
  });

  it("reports a first join that only came after failed attempts as a reconnect", async () => {
    const { sb, channels } = mockClient();
    const onStatus = vi.fn();
    const leave = subscribeWorkspace(sb, WS, () => {}, "main", { onStatus });
    await flush();
    const sync = channels.get(syncTopic(WS))!;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    sync.onStatus?.("TIMED_OUT");
    expect(onStatus).not.toHaveBeenCalled();
    sync.onStatus?.("SUBSCRIBED");

    expect(onStatus).toHaveBeenCalledWith("subscribed", true);
    warn.mockRestore();
    leave();
  });

  it("removes the sync channel only once the last subscriber has been gone a moment", async () => {
    const { sb, raw, channels } = mockClient();
    const leaveA = subscribeWorkspace(sb, WS, () => {}, "main");
    const leaveB = subscribeWorkspace(sb, WS, () => {}, "tasks");
    await flush();

    leaveA();
    await vi.advanceTimersByTimeAsync(SYNC_LINGER_MS);
    expect(channels.get(syncTopic(WS))?.removed).toBe(false);

    // A remount within the linger keeps the same channel.
    leaveB();
    const leaveC = subscribeWorkspace(sb, WS, () => {}, "tasks");
    await vi.advanceTimersByTimeAsync(SYNC_LINGER_MS);
    expect(channels.get(syncTopic(WS))?.removed).toBe(false);
    expect(raw.channel.mock.calls.filter(([t]) => t === syncTopic(WS))).toHaveLength(1);

    leaveC();
    await vi.advanceTimersByTimeAsync(SYNC_LINGER_MS);
    expect(channels.get(syncTopic(WS))?.removed).toBe(true);
  });

  it("a subscriber arriving while the channel is still leaving joins a fresh one once it has left", async () => {
    const { sb, raw, channels, send, finishRemovals } = mockClient(ME, { holdRemovals: true });
    const leaveA = subscribeWorkspace(sb, WS, () => {}, "main");
    await flush();
    const first = channels.get(syncTopic(WS))!;

    leaveA();
    await vi.advanceTimersByTimeAsync(SYNC_LINGER_MS);
    expect(first.removed).toBe(true); // leaving, not yet acked

    const seen: WorkspaceChange[] = [];
    const leaveB = subscribeWorkspace(sb, WS, (c) => seen.push(c), "tasks");
    await flush();
    // Not handed the leaving channel, which could never join again.
    expect(raw.channel.mock.calls.filter(([t]) => t === syncTopic(WS))).toHaveLength(1);

    finishRemovals();
    await flush();

    expect(raw.channel.mock.calls.filter(([t]) => t === syncTopic(WS))).toHaveLength(2);
    const second = channels.get(syncTopic(WS))!;
    expect(second).not.toBe(first);
    expect(second.onStatus).not.toBeNull(); // subscribed
    send({ payload: { table: "events", id: "e1", kind: "delete" } });
    expect(seen).toMatchObject([{ eventType: "DELETE", table: "events", old: { id: "e1" } }]);
    leaveB();
  });

  it("a subscriber gone again before the old channel left never opens one", async () => {
    const { sb, raw, finishRemovals } = mockClient(ME, { holdRemovals: true });
    const leaveA = subscribeWorkspace(sb, WS, () => {}, "main");
    await flush();
    leaveA();
    await vi.advanceTimersByTimeAsync(SYNC_LINGER_MS);

    const leaveB = subscribeWorkspace(sb, WS, () => {}, "tasks");
    leaveB();
    await vi.advanceTimersByTimeAsync(SYNC_LINGER_MS);
    finishRemovals();
    await flush();

    expect(raw.channel.mock.calls.filter(([t]) => t === syncTopic(WS))).toHaveLength(1);
    expect(raw.removeChannel.mock.calls.filter(([c]) => c.topic === syncTopic(WS))).toHaveLength(1);
  });
});
